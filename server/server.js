const express = require('express');
const cors = require('cors');
const axios = require('axios');
const allBaseStations = require('./all_stations.json');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.redirect('http://localhost:3000');
});

const getDailyAverage = (pollutantArray) => {
    if (!pollutantArray || pollutantArray.length === 0) return undefined;
    const validValues = pollutantArray.filter(v => v !== null);
    if (validValues.length === 0) return undefined;
    const sum = validValues.reduce((a, b) => a + b, 0);
    return Math.round((sum / validValues.length) * 10) / 10;
};

app.get('/api/stations/:date', async (req, res) => {
    const { date } = req.params;
    const latitudes = allBaseStations.map(s => s.geo[0]);
    const longitudes = allBaseStations.map(s => s.geo[1]);
    const hourlyVariables = "us_aqi,pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone";
    const apiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitudes.join(',')}&longitude=${longitudes.join(',')}&start_date=${date}&end_date=${date}&hourly=${hourlyVariables}&timezone=Asia/Bangkok`;

    try {
        const response = await axios.get(apiUrl);
        const data = response.data;

        const updatedStations = allBaseStations.map((station, index) => {
            const apiResult = data[index];
            if (!apiResult || !apiResult.hourly) {
                return { ...station, status: 'Bảo trì', environmentalData: { aqi: 'N/A' } };
            }
            const hourlyData = apiResult.hourly;
            let dailyMaxAqi = null;
            if (hourlyData.us_aqi && hourlyData.us_aqi.length > 0) {
                const validAqiValues = hourlyData.us_aqi.filter(v => v !== null);
                if (validAqiValues.length > 0) dailyMaxAqi = Math.round(Math.max(...validAqiValues));
            }
            return {
                id: station.id, name: station.name, lat: station.geo[0], lng: station.geo[1],
                address: station.name.split('/')[1]?.trim() || 'Vietnam',
                status: dailyMaxAqi !== null ? 'Hoạt động' : 'Bảo trì', lastUpdate: date,
                environmentalData: {
                    aqi: dailyMaxAqi,
                    pm25: getDailyAverage(hourlyData.pm2_5), pm10: getDailyAverage(hourlyData.pm10),
                    co: getDailyAverage(hourlyData.carbon_monoxide), no2: getDailyAverage(hourlyData.nitrogen_dioxide),
                    so2: getDailyAverage(hourlyData.sulphur_dioxide), o3: getDailyAverage(hourlyData.ozone),
                    hourly: hourlyData
                }
            };
        });
        res.json({ stations: updatedStations });
    } catch (error) {
        console.error("Lỗi Open-Meteo:", error.message);
        res.status(500).json({ error: 'Failed to fetch data from Open-Meteo' });
    }
});


app.post('/api/map-info', async (req, res) => {
    const { bbox, width, height, x, y, layerName, time } = req.body;
    const wmsUrl = 'http://localhost:8080/geoserver/air_quality/wms';
    const params = new URLSearchParams({
        service: 'WMS', version: '1.1.1', request: 'GetFeatureInfo',
        layers: layerName, query_layers: layerName, info_format: 'application/json',
        feature_count: '1', srs: 'EPSG:4326', bbox, width, height, x, y,
    });
    if (time) params.append('time', time);

    try {
        const response = await axios.get(`${wmsUrl}?${params.toString()}`);
        res.json(response.data);
    } catch (error) {
        console.error("Lỗi GetFeatureInfo:", error.message);
        res.status(error.response?.status || 500).json({ error: 'Failed to fetch from GeoServer' });
    }
});


app.post('/api/chart-data', async (req, res) => {
    const { mapQueryInfo, centerDateStr } = req.body;
    const centerDate = new Date(centerDateStr);
    const dates = Array.from({ length: 7 }, (_, i) => {
        const date = new Date(centerDate);
        date.setDate(centerDate.getDate() + i - 3);
        return date;
    });

    const formatDate = (date) => date.toISOString().split('T')[0];

    const requests = dates.map(date => {
        const params = new URLSearchParams({
            service: 'WMS', version: '1.1.1', request: 'GetFeatureInfo',
            layers: 'air_quality:imagemosaic', query_layers: 'air_quality:imagemosaic',
            info_format: 'application/json', feature_count: '1', srs: 'EPSG:4326',
            bbox: mapQueryInfo.bbox, width: mapQueryInfo.width, height: mapQueryInfo.height,
            x: mapQueryInfo.x, y: mapQueryInfo.y, time: formatDate(date)
        });
        const wmsUrl = 'http://localhost:8080/geoserver/air_quality/wms';
        return axios.get(`${wmsUrl}?${params.toString()}`);
    });

    try {
        const responses = await Promise.all(requests.map(p => p.catch(e => e)));
        const chartData = responses.map((response, index) => {
            if (response instanceof Error) {
                 return {
                    date: new Date(dates[index]).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
                    value: null,
                };
            }
            const data = response.data;
            const value = (data.features && data.features.length > 0) ? data.features[0].properties.GRAY_INDEX : null;
            return {
                date: new Date(dates[index]).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
                value: value,
            };
        });
        res.json(chartData);
    } catch (error) {
        console.error("Lỗi lấy dữ liệu biểu đồ:", error.message);
        res.status(500).json({ error: 'Failed to fetch chart data' });
    }
});

app.listen(PORT, () => {
    console.log(`Backend server đang chạy trên: http://localhost:${PORT}`);
});