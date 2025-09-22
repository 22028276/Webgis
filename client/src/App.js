import React, { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './App.css';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import 'leaflet-geotiff';



delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

function getHeatIndexColor(val) {
  if (val <= 30) return '#43d967';
  if (val <= 34) return '#ffe066';
  if (val <= 39) return '#ffb347';
  if (val <= 45) return '#ff5e57';
  if (val <= 54) return '#b83227';
  return '#6d214f';
}

const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getToday = () => new Date();

const getPM25HealthRecommendation = (value) => {
    if (value === null || value === undefined) return null;
    if (value <= 12.0) return "Chất lượng không khí tốt. Bạn có thể hoạt động ngoài trời bình thường.";
    if (value <= 35.4) return "Chất lượng không khí ở mức trung bình. Nhóm nhạy cảm (người già, trẻ em, người có bệnh hô hấp) nên giảm bớt các hoạt động ngoài trời.";
    if (value <= 55.4) return "Chất lượng không khí kém. Nhóm nhạy cảm nên tránh ra ngoài. Những người khác nên hạn chế các hoạt động gắng sức ngoài trời.";
    if (value <= 150.4) return "Chất lượng không khí xấu. Mọi người nên tránh các hoạt động ngoài trời. Nếu phải ra ngoài, hãy đeo khẩu trang chuyên dụng.";
    if (value <= 250.4) return "Chất lượng không khí rất xấu, ảnh hưởng nghiêm trọng đến sức khỏe. Mọi người nên ở trong nhà và đóng kín cửa sổ.";
    return "Mức độ nguy hại. Cảnh báo khẩn cấp về sức khỏe. Mọi người tuyệt đối không ra ngoài.";
};

const getAQILevel = (aqi) => {
    if (aqi === 'N/A' || aqi === undefined || aqi === null) return 'Không có dữ liệu';
    if (aqi === '-') return 'Chưa tính toán';
    if (aqi <= 50) return 'Tốt';
    if (aqi <= 100) return 'Trung bình';
    if (aqi <= 150) return 'Kém';
    if (aqi <= 200) return 'Xấu';
    if (aqi <= 300) return 'Rất xấu';
    return 'Nguy hại';
};

const InfoSidebar = ({ info, isLoading, onClose, date }) => {
  const [chartData, setChartData] = useState(null);
  const [isChartLoading, setIsChartLoading] = useState(false);
  const [chartError, setChartError] = useState(null);
  const chartQueryRef = useRef(null);

  useEffect(() => {
    const newQuery = info ? JSON.stringify({lat: info.lat, lng: info.lng}) : null;
    
    if (info && info.label === 'PM2.5' && chartQueryRef.current !== newQuery) {
      chartQueryRef.current = newQuery;
      
      const loadChartData = async () => {
        setIsChartLoading(true);
        setChartError(null);
        try {
            const response = await fetch(`/api/chart-data`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    lat: info.lat,
                    lng: info.lng,
                    centerDateStr: date,
                }),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Lỗi không xác định từ backend");
            }
            const data = await response.json();
            setChartData(data);
        } catch (error) {
            console.error("Lỗi khi tải dữ liệu biểu đồ:", error.message);
            setChartError("Không thể tải dữ liệu biểu đồ.");
            setChartData(null);
        } finally {
            setIsChartLoading(false);
        }
      };
      loadChartData();
    } else if (!info || info.label !== 'PM2.5') {
        setChartData(null);
        setChartError(null);
        chartQueryRef.current = null;
    }
  }, [info, date]);

  if (!info) return null;
  
  const recommendation = info.label === 'PM2.5' ? getPM25HealthRecommendation(info.value) : null;

  return (
    <div className="info-sidebar">
      <div className="info-sidebar-header">
        <h3>Thông tin tại điểm</h3>
        <button onClick={onClose} className="close-btn">×</button>
      </div>
      <div className="info-sidebar-content">
        {isLoading ? (
          <p>Đang tải dữ liệu điểm...</p>
        ) : (
          <>
            <div className="info-item location-item">
              <strong>Vị trí:</strong>
              <span>
                {info.locationName || 'Đang xác định...'}
                {info.lat && info.lng && (
                  <span className="coordinates-inline">
                    {' '}( {info.lat.toFixed(3)}, {info.lng.toFixed(3)})
                  </span>
                )}
              </span>
            </div>
            <div className="info-item">
              <strong>{info.label || 'Giá trị'}:</strong>
              <span className="info-value">
                {info.value !== null ? `${info.value.toFixed(2)}${info.unit || ''}` : 'Không có dữ liệu'}
              </span>
            </div>
            {recommendation && (
              <div className="info-item recommendation-item">
                <strong>Khuyến cáo:</strong>
                <span>{recommendation}</span>
              </div>
            )}
          </>
        )}

        {info.label === 'PM2.5' && (
            <div className="chart-container">
            <h4>Dữ liệu PM2.5 trong 7 ngày</h4>
            {isChartLoading && <p>Đang tải dữ liệu biểu đồ...</p>}
            {chartError && <p style={{ color: 'red' }}>{chartError}</p>}
            {chartData && !chartError && (
                <ResponsiveContainer width="100%" height={150}>
                <LineChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="value" name="PM2.5" stroke="#8884d8" strokeWidth={2} connectNulls />
                </LineChart>
                </ResponsiveContainer>
            )}
            {!isChartLoading && !chartData && !chartError && <p>Không có dữ liệu biểu đồ.</p>}
            </div>
        )}
      </div>
    </div>
  );
};

function App() {
  const [map, setMap] = useState(null);
  const [showHealthModal, setShowHealthModal] = useState(false);
  const [showStationList, setShowStationList] = useState(false);
  const [stationListType, setStationListType] = useState('all');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarInfo, setSidebarInfo] = useState(null);
  const [isSidebarLoading, setIsSidebarLoading] = useState(false);
  
  const [currentDateTime, setCurrentDateTime] = useState(() => {
    const today = getToday();
    today.setHours(new Date().getHours(), 0, 0, 0);
    return today;
  });

  const [allDayData, setAllDayData] = useState([]);
  const [hourlyStations, setHourlyStations] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const pm25LayerRef = useRef(null);
  const demLayerRef = useRef(null);
  const layersControlRef = useRef(null);

  const START_DATE = new Date('2023-01-01');
  const LATEST_DATE = getToday();
  const apiDate = formatDate(currentDateTime);
  const selectedHour = currentDateTime.getHours();

  const handleMapClick = useCallback(async (e) => {
    if (!map) return;
    
    const { lat, lng } = e.latlng;
    let label = '';
    let unit = '';
    let layerName = '';

    if (map.hasLayer(pm25LayerRef.current)) {
        label = 'PM2.5';
        unit = ' µg/m³';
        layerName = 'PM25';
    } else if (map.hasLayer(demLayerRef.current)) {
        label = 'Độ cao';
        unit = ' m';
        layerName = 'DEM';
    } else {
      setSidebarInfo(null);
      return;
    }
    
    setIsSidebarLoading(true);
    setSidebarInfo({ value: null, label, unit, locationName: 'Đang xác định...', lat, lng });

    try {
        const response = await fetch(`/api/map-info`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ time: apiDate, lat, lng, layerName })
        });
        if (!response.ok) throw new Error('Backend error');
        
        const data = await response.json();
      
        setSidebarInfo({ value: data.value, locationName: data.locationName, label, unit, lat, lng });
    } catch (error) {
        console.error("Lỗi khi gọi API map-info:", error);
        setSidebarInfo({ value: null, locationName: 'Lỗi khi lấy dữ liệu', label, unit, lat, lng });
    } finally {
        setIsSidebarLoading(false);
    }
  }, [map, apiDate]);

  useEffect(() => {
    if (!mapRef.current) {
      const newMap = L.map('map', { center: [16.46, 107.59], zoom: 6, zoomControl: false, attributionControl: false });
      const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 });
      
      const demRasterUrl = `/api/tiff-proxy/DEM_VN_3km.tif`;
      const demLayer = L.leafletGeotiff(demRasterUrl, {
        renderer: new L.LeafletGeotiffRenderer(), 
        band: 0,
        displayMin: 0,
        displayMax: 3000,
        colorScale: (value) => {
          if (value <= 0) return '#2e8b5700';
          if (value <= 200) return '#2e8b57';
          if (value <= 500) return '#6b8e23';
          if (value <= 1000) return '#b8860b';
          if (value <= 2000) return '#cd853f';
          return '#a0522d';
        },
      });
      demLayer.setOpacity(0.7);
      demLayerRef.current = demLayer;

      const baseMaps = { "Bản đồ nền": osmLayer };
      const overlayMaps = { "Lớp DEM": demLayer };
      const control = L.control.layers(baseMaps, overlayMaps, { position: 'topright' }).addTo(newMap);
      
      layersControlRef.current = control;
      osmLayer.addTo(newMap);
      L.control.zoom({ position: 'topright' }).addTo(newMap);
      L.control.attribution({ position: 'bottomright' }).addTo(newMap);
      setMap(newMap);
      mapRef.current = newMap;
    }
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!map) return;
    map.on('click', handleMapClick);
    return () => {
      map.off('click', handleMapClick);
    };
  }, [map, handleMapClick]);

  useEffect(() => {
    const loadDataForDay = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/stations/${apiDate}`);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        setAllDayData(data.stations || []);
      } catch (error) {
        console.error('Lỗi khi tải dữ liệu trạm từ backend:', error);
        setAllDayData([]);
      } finally {
        setLoading(false);
      }
    };
    loadDataForDay();
  }, [apiDate]);

  useEffect(() => {
    if (!allDayData.length) {
        setHourlyStations([]);
        return;
    };
    const processedStations = allDayData.map(station => {
        const hourlyEnvData = station.environmentalData?.hourly;
        if (!hourlyEnvData || !hourlyEnvData.time || hourlyEnvData.time.length <= selectedHour) {
            return { ...station, aqi: 'N/A' };
        }
        const aqiForHour = hourlyEnvData.us_aqi[selectedHour];
        return {
            ...station,
            environmentalData: {
                ...station.environmentalData,
                aqi: aqiForHour !== null ? aqiForHour : 'N/A',
                pm25: hourlyEnvData.pm2_5[selectedHour],
                pm10: hourlyEnvData.pm10[selectedHour],
                co: hourlyEnvData.carbon_monoxide[selectedHour],
                no2: hourlyEnvData.nitrogen_dioxide[selectedHour],
                so2: hourlyEnvData.sulphur_dioxide[selectedHour],
                o3: hourlyEnvData.ozone[selectedHour],
            },
            lastUpdate: `${apiDate} ${String(selectedHour).padStart(2, '0')}:00`,
        };
    });
    setHourlyStations(processedStations);
  }, [allDayData, selectedHour, apiDate]);

  const getMarkerColor = useCallback((aqi) => {
    if (aqi === 'N/A' || aqi === undefined || aqi === null) return '#95a5a6';
    if (aqi === '-') return '#3498db';
    if (aqi <= 50) return '#27ae60';
    if (aqi <= 100) return '#f1c40f';
    if (aqi <= 150) return '#e67e22';
    if (aqi <= 200) return '#c0392b';
    if (aqi <= 300) return '#8e44ad';
    return '#78281f';
  }, []);

  const createPopupContent = useCallback((station) => {
    const envData = station.environmentalData || {};
    const aqi = envData.aqi ?? 'N/A';
    const aqiLevel = getAQILevel(aqi);
    const aqiColor = getMarkerColor(aqi);
    const renderPollutant = (name, value, unit) => {
      if (value === undefined || value === null) return '';
      return `<div>${name}: <b>${value}</b> ${unit}</div>`;
    };

    return `
      <div class="station-popup-content">
        <h3 style="margin: 0 0 10px 0; color: #333;">${station.name}</h3>
        <p style="margin: 5px 0; font-size: 14px; color: #666;">Trạng thái: <b style="color: ${station.status === 'Hoạt động' ? '#27ae60' : '#c0392b'}">${station.status}</b></p>
        <div style="margin: 15px 0; padding: 10px; background: #f8f9fa; border-radius: 5px;">
          <div style="display: flex; align-items: center; margin-bottom: 10px;">
            <div style="width: 40px; height: 40px; background-color: ${aqiColor}; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 10px;">
              <span style="color: white; font-weight: bold; font-size: 16px;">${aqi}</span>
            </div>
            <div>
              <div style="font-weight: bold; color: #333;">AQI (Lúc ${String(selectedHour).padStart(2, '0')}:00)</div>
              <div style="font-size: 14px; color: ${aqiColor}; font-weight: bold;">${aqiLevel}</div>
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px;">
            ${renderPollutant('PM2.5', envData.pm25, 'µg/m³')}
            ${renderPollutant('PM10', envData.pm10, 'µg/m³')}
            ${renderPollutant('O₃', envData.o3, 'µg/m³')}
            ${renderPollutant('NO₂', envData.no2, 'µg/m³')}
            ${renderPollutant('SO₂', envData.so2, 'µg/m³')}
            ${renderPollutant('CO', envData.co, 'µg/m³')}
          </div>
        </div>
        <p style="margin-top: 15px; font-size: 12px; color: #999;">Dữ liệu lúc: ${station.lastUpdate || 'Không có'}</p>
      </div>
    `;
  }, [selectedHour, getMarkerColor]);

  useEffect(() => {
    if (!map) return;
    markersRef.current.forEach(marker => map.removeLayer(marker));
    markersRef.current = [];

    if (!hourlyStations.length) return;

    hourlyStations.forEach(station => {
      if (typeof station.lat !== 'number' || typeof station.lng !== 'number') return;
      
      const aqiValue = station.environmentalData?.aqi;
      const markerColor = getMarkerColor(aqiValue);
      const markerIcon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="width: 24px; height: 24px; background-color: ${markerColor}; border: 2px solid white; border-radius: 50%; box-shadow: 0 2px 5px rgba(0,0,0,0.4); cursor: pointer; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: bold; text-shadow: 0 1px 2px rgba(0,0,0,0.5);">${aqiValue ?? ''}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      const marker = L.marker([station.lat, station.lng], { icon: markerIcon })
        .addTo(map)
        .bindPopup(createPopupContent(station), { maxWidth: 350, className: 'station-popup' });
      markersRef.current.push(marker);
    });
  }, [map, hourlyStations, createPopupContent, getMarkerColor]);

  useEffect(() => {
    if (!map || !layersControlRef.current) return;

    if (pm25LayerRef.current) {
        map.removeLayer(pm25LayerRef.current);
        layersControlRef.current.removeLayer(pm25LayerRef.current);
    }
    
    const rasterUrl = `/api/tiff-proxy/PM25_${apiDate.replace(/-/g, '')}_3km.tif`;

    const newLayer = L.leafletGeotiff(rasterUrl, {
      renderer: new L.LeafletGeotiffRenderer(),
      band: 0,
      displayMin: 0,
      displayMax: 250,
      colorScale: (value) => {
          if (value < 0) return '#00E40000';
          if (value <= 12) return '#00E400';
          if (value <= 35.4) return '#FFFF00';
          if (value <= 55.4) return '#FF7E00';
          if (value <= 150.4) return '#FF0000';
          if (value <= 250.4) return '#8F3F97';
          return '#7E0023';
      },
    });
    newLayer.setOpacity(0.7);

    layersControlRef.current.addOverlay(newLayer, "Lớp PM2.5");
    pm25LayerRef.current = newLayer;

  }, [apiDate, map]);

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setCurrentDateTime(prevDateTime => {
          const newDateTime = new Date(prevDateTime);
          newDateTime.setHours(newDateTime.getHours() + 1);
          const finalDateTime = getToday();
          finalDateTime.setHours(23, 0, 0, 0);
          if (newDateTime > finalDateTime) {
            setIsPlaying(false);
            return finalDateTime;
          }
          return newDateTime;
        });
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isPlaying]);

  const zoomToStation = (station) => {
    if (map) {
      map.setView([station.lat, station.lng], 15);
      const markerToOpen = markersRef.current.find(m =>
        m.getLatLng().lat === station.lat && m.getLatLng().lng === station.lng
      );
      markerToOpen?.openPopup();
    }
    setShowStationList(false);
    setSearchQuery('');
  };

  const getFilteredStations = () => {
    let filtered = hourlyStations;
    if (stationListType === 'active') {
      filtered = filtered.filter(station => station.status === 'Hoạt động');
    }
    if (searchQuery) {
        filtered = filtered.filter(station =>
            station.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }
    return filtered;
  };

  const activeStationsCount = allDayData.filter(s => s.status === 'Hoạt động').length;

  const handleCloseStationList = () => {
    setShowStationList(false);
    setSearchQuery('');
  };
  
  const handleHourChangeByStep = (step) => {
    setCurrentDateTime(prev => {
        const newDateTime = new Date(prev);
        newDateTime.setHours(newDateTime.getHours() + step);
        const finalDateTime = getToday();
        finalDateTime.setHours(23, 59, 59, 999);
        if (newDateTime > finalDateTime || newDateTime < START_DATE) {
            return prev;
        }
        return newDateTime;
    });
  };

  const handlePlayPause = () => {
    const finalDateTime = getToday();
    finalDateTime.setHours(23, 0, 0, 0);
    if (currentDateTime >= finalDateTime) {
      setIsPlaying(false);
      return;
    }
    setIsPlaying(!isPlaying);
  };

  const handleDateInputChange = (e) => {
    const newDateStr = e.target.value;
    if (!newDateStr) return;
    const [year, month, day] = newDateStr.split('-').map(Number);
    setCurrentDateTime(prev => {
        const newDateTime = new Date(prev);
        newDateTime.setFullYear(year, month - 1, day);
        return newDateTime;
    });
  };

  const handleSliderChange = (e) => {
    const newHour = parseInt(e.target.value, 10);
    setCurrentDateTime(prev => {
        const newDateTime = new Date(prev);
        newDateTime.setHours(newHour);
        return newDateTime;
    });
  };

  return (
    <div className="App">
      <div className="header">
        <div className="header-content">
          <div className="header-left">
            <h1>WebGIS Môi Trường</h1>
            <p>Hệ thống quan trắc chất lượng không khí Việt Nam</p>
          </div>
          <div className="header-right">
            <div className="stats">
              <div className="stat-item" onClick={() => { setShowStationList(true); setStationListType('all'); }}>
                <span className="stat-number">{allDayData.length}</span>
                <span className="stat-label">Tổng trạm</span>
              </div>
              <div className="stat-item" onClick={() => { setShowStationList(true); setStationListType('active'); }}>
                <span className="stat-number">{activeStationsCount}</span>
                <span className="stat-label">Đang hoạt động</span>
              </div>
            </div>
            <button className="health-info-btn" onClick={() => setShowHealthModal(true)}>
              ⚠️ Thông tin sức khỏe
            </button>
          </div>
        </div>
      </div>

      <div id="map" className="map-container"></div>
      
      <InfoSidebar
        info={sidebarInfo}
        isLoading={isSidebarLoading}
        onClose={() => setSidebarInfo(null)}
        date={apiDate}
      />

      {showHealthModal && (
        <div className="modal-overlay" onClick={() => setShowHealthModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Thông tin sức khỏe & Chỉ số AQI</h2>
              <button className="close-btn" onClick={() => setShowHealthModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="health-section">
                <h3>Chỉ số chất lượng không khí (AQI)</h3>
                <div className="aqi-table">
                  <table>
                    <thead><tr><th>Giá trị AQI</th><th>Mức độ</th><th>Ảnh hưởng sức khỏe</th></tr></thead>
                    <tbody>
                      <tr style={{backgroundColor: getMarkerColor(25)}}><td>0-50</td><td>Tốt</td><td>Chất lượng không khí tốt, không ảnh hưởng tới sức khỏe.</td></tr>
                      <tr style={{backgroundColor: getMarkerColor(75)}}><td>51-100</td><td>Trung bình</td><td>Nhóm nhạy cảm nên hạn chế ở ngoài.</td></tr>
                      <tr style={{backgroundColor: getMarkerColor(125)}}><td>101-150</td><td>Kém</td><td>Người nhạy cảm gặp vấn đề về sức khỏe.</td></tr>
                      <tr style={{backgroundColor: getMarkerColor(175)}}><td>151-200</td><td>Xấu</td><td>Người bình thường bị ảnh hưởng sức khỏe.</td></tr>
                      <tr style={{backgroundColor: getMarkerColor(250)}}><td>201-300</td><td>Rất xấu</td><td>Cảnh báo sức khỏe: mọi người bị ảnh hưởng nghiêm trọng.</td></tr>
                      <tr style={{backgroundColor: getMarkerColor(350)}}><td>300+</td><td>Nguy hại</td><td>Cảnh báo khẩn cấp: Mọi người có thể bị ảnh hưởng sức khỏe nghiêm trọng.</td></tr>
                    </tbody>
                  </table>
                </div>
                <div className="heat-index-section">
                  <h3>Chỉ số nhiệt (Heat Index)</h3>
                  <div className="heat-index-table" style={{overflowX: 'auto', maxWidth: '100%'}}>
                    <table style={{minWidth: '900px', fontSize: '13px', textAlign: 'center'}}>
                      <thead>
                        <tr>
                          <th>Nhiệt độ (°C)</th>
                          <th>25%</th><th>30%</th><th>34%</th><th>40%</th><th>45%</th><th>50%</th><th>55%</th><th>60%</th><th>65%</th><th>70%</th><th>75%</th><th>80%</th><th>85%</th><th>90%</th><th>95%</th><th>100%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          [43,49,51,54,56,59,61,64,66,68,71,73,75,78,80,83,85],
                          [42,48,50,52,54,57,59,61,64,66,68,70,73,75,77,79,82],
                          [41,46,48,50,53,55,57,59,61,63,65,68,70,73,74,76,78],
                          [40,45,47,49,51,53,55,57,59,61,63,65,67,70,71,73,75],
                          [39,43,45,47,49,51,53,55,57,58,60,62,64,66,68,70,72],
                          [38,42,44,45,47,49,51,52,54,56,58,60,62,63,65,67,69],
                          [37,40,42,44,45,47,49,50,52,54,56,57,59,61,63,64,66],
                          [36,39,40,42,44,45,47,48,50,52,53,55,57,58,60,62,63],
                          [35,37,39,40,42,43,45,46,48,50,51,53,54,56,57,59,60],
                          [34,36,37,39,40,42,43,45,46,47,49,50,52,53,55,56,58],
                          [33,34,36,37,39,40,41,43,44,45,47,48,50,51,52,54,55],
                          [32,33,34,36,37,38,40,41,42,43,45,46,47,49,50,51,53],
                          [31,32,33,34,35,37,38,39,40,42,43,44,45,46,48,49,50],
                          [30,30,32,33,34,35,36,37,38,40,41,42,43,44,45,47,48],
                          [29,29,30,31,32,33,34,36,37,38,39,40,41,42,43,44,45],
                          [28,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43],
                          [27,27,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41],
                          [26,26,26,27,28,29,30,31,32,32,33,34,35,36,37,38,39],
                          [25,25,25,26,26,27,28,29,30,31,32,33,33,34,35,36,37],
                          [24,24,24,24,25,26,27,27,28,29,30,31,32,32,33,34,35],
                          [23,23,23,23,24,24,25,26,27,27,28,29,30,31,31,32,33],
                          [22,22,22,22,22,23,24,24,25,26,27,27,28,29,30,30,31],
                          [21,21,21,21,21,22,22,23,24,24,25,26,26,27,28,28,29],
                          [20,20,20,20,20,20,21,22,22,23,23,24,25,25,26,27,27]
                        ].map((row, i) => (
                          <tr key={i}>
                            <td style={{fontWeight:'bold'}}>{row[0]}°C</td>
                            {row.slice(1).map((val, j) => (
                              <td key={j} style={{background:getHeatIndexColor(val), color:'#fff', fontWeight:'bold', textShadow:'0 1px 2px rgba(0,0,0,0.18)'}}>{val}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="heat-index-legend" style={{marginTop:'16px'}}>
                    <div style={{display:'flex',gap:'12px',flexWrap:'wrap',alignItems:'center',fontSize:'13px'}}>
                      <span style={{background:'#43d967',color:'#fff',padding:'2px 10px',borderRadius:'8px',fontWeight:'bold'}}>Dễ chịu</span>
                      <span style={{background:'#ffe066',color:'#222',padding:'2px 10px',borderRadius:'8px',fontWeight:'bold'}}>Khó chịu nhẹ</span>
                      <span style={{background:'#ffb347',color:'#222',padding:'2px 10px',borderRadius:'8px',fontWeight:'bold'}}>Khó chịu</span>
                      <span style={{background:'#ff5e57',color:'#fff',padding:'2px 10px',borderRadius:'8px',fontWeight:'bold'}}>Rất khó chịu</span>
                      <span style={{background:'#b83227',color:'#fff',padding:'2px 10px',borderRadius:'8px',fontWeight:'bold'}}>Nguy hiểm</span>
                      <span style={{background:'#6d214f',color:'#fff',padding:'2px 10px',borderRadius:'8px',fontWeight:'bold'}}>Độc hại</span>
                    </div>
                    <ul style={{marginTop:'10px',fontSize:'13px',paddingLeft:'18px',color:'#444'}}>
                      <li><b>Dễ chịu</b>: Không gây khó chịu cho đa số người.</li>
                      <li><b>Khó chịu nhẹ</b>: Có thể gây khó chịu nhẹ với người nhạy cảm.</li>
                      <li><b>Khó chịu</b>: Sự khó chịu thể hiện rõ ràng. <b>Cảnh báo</b>: Giới hạn thực hiện các công việc thể chất nặng nhọc.</li>
                      <li><b>Rất khó chịu</b>: <b>Nguy hiểm</b>: Tránh các hoạt động cố sức bên ngoài trời.</li>
                      <li><b>Nguy hiểm</b>: Dừng mọi hoạt động thể chất vì có thể gây ra nguy hiểm nghiêm trọng.</li>
                      <li><b>Độc hại</b>: Rủi ro về say nắng có thể dẫn đến tử vong.</li>
                    </ul>
                  </div>
                </div>
                <div className="sensitive-groups">
                  <h3>Nhóm người nhạy cảm</h3>
                  <p>Bao gồm: trẻ em, người già và những người mắc bệnh hô hấp, tim mạch.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showStationList && (
        <div className="modal-overlay" onClick={handleCloseStationList}>
          <div className="modal-content station-list-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{stationListType === 'all' ? 'Danh sách tất cả trạm' : 'Trạm đang hoạt động'}</h2>
              <button className="close-btn" onClick={handleCloseStationList}>×</button>
            </div>
            <div className="modal-body">
              <div className="search-container" style={{ marginBottom: '15px' }}>
                <input
                  type="text"
                  placeholder="Tìm kiếm trạm..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                      width: '100%',
                      padding: '12px 15px',
                      borderRadius: '8px',
                      border: '1px solid #ddd',
                      fontSize: '16px',
                      boxSizing: 'border-box'
                  }}
                />
              </div>
              <div className="station-list">
                {getFilteredStations().map(station => (
                  <div key={station.id} className="station-item" onClick={() => zoomToStation(station)}>
                    <div className="station-info">
                      <h4>{station.name}</h4>
                      <p>{station.address}</p>
                      <p>Trạng thái: <span className={`status ${station.status === 'Hoạt động' ? 'active' : 'maintenance'}`}>{station.status}</span></p>
                    </div>
                    <div className="station-aqi">
                      <div className="aqi-circle" style={{backgroundColor: getMarkerColor(station.environmentalData?.aqi)}}>
                        {station.environmentalData?.aqi ?? 'N/A'}
                      </div>
                      <span className="aqi-level">{getAQILevel(station.environmentalData?.aqi)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={`timeline-container ${loading ? 'timeline-loading' : ''}`}>
          <button onClick={() => handleHourChangeByStep(-1)} disabled={isPlaying || currentDateTime <= START_DATE} className="timeline-nav-btn prev">❮</button>
          
          <div className="timeline-center-section">
              <div className="timeline-top-row">
                  <div className="date-picker-container">
                      <label htmlFor="date-picker">🗓️</label>
                      <input
                          type="date"
                          id="date-picker"
                          value={apiDate}
                          min={formatDate(START_DATE)}
                          max={formatDate(LATEST_DATE)}
                          onChange={handleDateInputChange}
                          disabled={isPlaying}
                      />
                  </div>
                  <button onClick={handlePlayPause} className="play-pause-btn">
                      {isPlaying ? '❚❚' : '▶'}
                  </button>
                  <div className="timeline-date-display">
                      {String(selectedHour).padStart(2, '0')}:00
                  </div>
              </div>
              <div className="timeline-slider-wrapper">
                  <input
                      type="range"
                      min="0"
                      max="23"
                      step="1"
                      value={selectedHour}
                      onChange={handleSliderChange}
                      disabled={isPlaying}
                      className="timeline-slider"
                  />
                  <div className="timeline-ticks">
                      {[0, 3, 6, 9, 12, 15, 18, 21, 23].map(hour => (
                          <span key={hour} style={{ left: `${(hour / 23) * 100}%` }}>
                              {String(hour).padStart(2, '0')}
                          </span>
                      ))}
                  </div>
              </div>
          </div>

          <button onClick={() => handleHourChangeByStep(1)} disabled={isPlaying || currentDateTime >= new Date(new Date(LATEST_DATE).setHours(23,0,0,0))} className="timeline-nav-btn next">❯</button>
      </div>
    </div>
  );
}

export default App;