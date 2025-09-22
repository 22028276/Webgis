require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const geotiff = require('geotiff');
const allBaseStations = require('./all_stations.json');

const app = express();
app.use(cors());
app.use(express.json());

const DATA_BUCKET_URL = 'https://raw.githubusercontent.com/22028276/Webgis/main/client/public/data';

app.get('/api/raster-data', async (req, res) => {
    const { date, file } = req.query;
    let filename;

    if (file) {
        filename = file;
    } else if (date) {
        filename = `PM25_${date.replace(/-/g, '')}_3km.tif`;
    } else {
        return res.status(400).send('Missing date or file query parameter');
    }
    
    const tiffUrl = `${DATA_BUCKET_URL}/${filename}`;

    try {
        const response = await axios.get(tiffUrl, { responseType: 'stream' });
        response.data.pipe(res);
    } catch (error) {
        console.error(`Không thể lấy file: ${tiffUrl}`, error.message);
        res.status(404).send('File not found');
    }
});

async function getValueFromTiff(lat, lng, filename) {
    const tiffUrl = `${DATA_BUCKET_URL}/${filename}`;
    try {
        const tiff = await geotiff.fromUrl(tiffUrl);
        const image = await tiff.getImage();
        const bbox = image.getBoundingBox();
        const width = image.getWidth();
        const height = image.getHeight();
        const [minLng, minLat, maxLng, maxLat] = bbox;

        if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) return null;

        const px = Math.floor(width * ((lng - minLng) / (maxLng - minLng)));
        const py = Math.floor(height * ((maxLat - lat) / (maxLat - minLat)));
        const data = await image.readRasters({ window: [px, py, px + 1, py + 1] });
        const value = data[0][0];

        return value < -999 ? null : value;
    } catch (error) {
        console.error(`Không thể đọc file: ${tiffUrl}`, error.message);
        return null;
    }
}

app.post('/api/map-info', async (req, res) => {
    const { lat, lng, time, layerName } = req.body;
    
    let locationName = 'Không xác định được vị trí';
    try {
        const geoUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=vi`;
        const geoResponse = await axios.get(geoUrl, { headers: { 'User-Agent': 'WebGIS-MoiTruong-App/1.0' } });
        locationName = geoResponse.data?.display_name || locationName;
    } catch (error) {
        console.error("Lỗi Reverse Geocoding:", error.message);
    }
    
    let filename;
    if (layerName === 'DEM') {
        filename = 'DEM_VN_3km.tif';
    } else if (layerName === 'PM25') {
        filename = `PM25_${time.replace(/-/g, '')}_3km.tif`;
    } else {
        return res.status(400).json({ value: null, locationName });
    }

    const value = await getValueFromTiff(lat, lng, filename);
    res.json({ value, locationName });
});

app.post('/api/chart-data', async (req, res) => {
    const { lat, lng, centerDateStr } = req.body;
    const centerDate = new Date(centerDateStr);
    
    const datePromises = Array.from({ length: 7 }, async (_, i) => {
        const date = new Date(centerDate);
        date.setDate(centerDate.getDate() + i - 3);
        const dateString = date.toISOString().split('T')[0];
        const filename = `PM25_${dateString.replace(/-/g, '')}_3km.tif`;
        const value = await getValueFromTiff(lat, lng, filename);

        return {
            date: date.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit' }),
            value: value,
        };
    });

    try {
        const chartData = await Promise.all(datePromises);
        res.json(chartData);
    } catch (error) {
        console.error("Lỗi lấy dữ liệu biểu đồ:", error.message);
        res.status(500).json({ error: 'Failed to fetch chart data' });
    }
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
                environmentalData: { aqi: dailyMaxAqi, pm25: getDailyAverage(hourlyData.pm_5), pm10: getDailyAverage(hourlyData.pm10), co: getDailyAverage(hourlyData.carbon_monoxide), no2: getDailyAverage(hourlyData.nitrogen_dioxide), so2: getDailyAverage(hourlyData.sulphur_dioxide), o3: getDailyAverage(hourlyData.ozone), hourly: hourlyData }
            };
        });
        res.json({ stations: updatedStations });
    } catch (error) {
        console.error("Lỗi Open-Meteo:", error.message);
        res.status(500).json({ error: 'Failed to fetch data from Open-Meteo' });
    }
});

module.exports = app;