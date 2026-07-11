import { useState, useRef, useEffect } from 'react';
import Globe from 'react-globe.gl';
import './App.css';

function App() {
  const globeRef = useRef();
  const [countries, setCountries] = useState({ features: [] });
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [facts, setFacts] = useState([]);
  const [selectedLetter, setSelectedLetter] = useState(null);

  // Load GeoJSON on mount
  useEffect(() => {
    fetch('/countries.geojson')
      .then(res => res.json())
      .then(data => setCountries(data));
  }, []);

  const handleCountryClick = (country) => {
    setSelectedCountry(country);

    // Smoothly point camera at the country's centroid
    if (globeRef.current && country) {
      const coords = getCentroid(country);
      globeRef.current.pointOfView({ lat: coords[1], lng: coords[0], altitude: 1.5 }, 1000);
    }

    // Fetch facts from backend (placeholder for now)
    fetch(`http://localhost:3001/api/countries/${country.properties.ISO_A2}/facts`)
      .then(res => res.json())
      .then(data => setFacts(data.facts))
      .catch(() => setFacts([]));
  };

  const handleLetterClick = (letter) => {
    // toggle off if clicking the same letter again
    setSelectedLetter(prev => (prev === letter ? null : letter));
    setSelectedCountry(null); // clear single-country selection so colors don't conflict
    setFacts([]);
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <Globe
        ref={globeRef}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
        backgroundColor="#000000"
        polygonsData={countries.features}
        polygonCapColor={(d) => {
          if (selectedLetter) {
            return d.properties.ADMIN.toUpperCase().startsWith(selectedLetter)
              ? 'rgba(255, 100, 50, 0.8)'
              : 'rgba(200, 200, 200, 0.15)';
          }
          return d === selectedCountry
            ? 'rgba(255, 100, 50, 0.8)'
            : 'rgba(200, 200, 200, 0.3)';
        }}
        polygonSideColor={() => 'rgba(0, 100, 200, 0.15)'}
        polygonStrokeColor={() => '#111'}
        polygonLabel={(d) => d.properties.ADMIN}
        onPolygonClick={handleCountryClick}
        polygonsTransitionDuration={300}
      />

      <div style={sidebarStyle}>
        {ALPHABET.map((letter) => (
          <button
            key={letter}
            onClick={() => handleLetterClick(letter)}
            style={{
              ...letterButtonStyle,
              background: selectedLetter === letter ? '#ff6432' : 'rgba(255,255,255,0.08)',
            }}
          >
            {letter}
          </button>
        ))}
      </div>

      {selectedCountry && (
        <div style={panelStyle}>
          <h2>{selectedCountry.properties.ADMIN}</h2>
          {facts.length > 0 ? (
            <ul>
              {facts.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          ) : (
            <p>No facts loaded yet — hook up the backend pipeline.</p>
          )}
        </div>
      )}
    </div>
  );
}

// Rough centroid from polygon coordinates (good enough for camera framing)
function getCentroid(feature) {
  const coords = feature.geometry.type === 'Polygon'
    ? feature.geometry.coordinates[0]
    : feature.geometry.coordinates[0][0];
  const lngs = coords.map(c => c[0]);
  const lats = coords.map(c => c[1]);
  return [
    (Math.min(...lngs) + Math.max(...lngs)) / 2,
    (Math.min(...lats) + Math.max(...lats)) / 2,
  ];
}

const panelStyle = {
  position: 'absolute',
  top: 20,
  right: 20,
  width: 320,
  maxHeight: '80vh',
  overflowY: 'auto',
  background: 'rgba(20, 20, 20, 0.85)',
  color: 'white',
  padding: '16px 20px',
  borderRadius: 12,
  fontFamily: 'sans-serif',
};

const ALPHABET = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));

const sidebarStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  height: '100vh',
  width: 44,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: 2,
  background: 'rgba(20, 20, 20, 0.6)',
  padding: '8px 0',
};

const letterButtonStyle = {
  border: 'none',
  color: 'white',
  fontSize: 12,
  fontFamily: 'sans-serif',
  cursor: 'pointer',
  padding: '3px 0',
  borderRadius: 4,
  margin: '0 4px',
};

export default App;