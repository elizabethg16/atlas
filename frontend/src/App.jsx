import { useState, useRef, useEffect, useMemo } from 'react';
import Globe from 'react-globe.gl';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL;

function stableId(adm0a3, name) {
  const slug = name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') ?? 'unknown';
  return `${adm0a3}-${slug}`;
}

function App() {
  const globeRef = useRef();

  const [countries, setCountries] = useState({ features: [] });
  const [admin1, setAdmin1] = useState({ features: [] });
  const [cities, setCities] = useState({ features: [] });
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [selectedCity, setSelectedCity] = useState(null);
  const [selectedLetter, setSelectedLetter] = useState(null);
  const [drilledIn, setDrilledIn] = useState(false);
  const [showCities, setShowCities] = useState(true);
  const [facts, setFacts] = useState([]);
  const [sourceUrl, setSourceUrl] = useState(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}countries.geojson`)
      .then(res => res.json())
      .then(data => {
        data.features = data.features.filter(f => f.geometry !== null);
        setCountries(data);
      });

    fetch(`${import.meta.env.BASE_URL}admin1.geojson`)
      .then(res => res.json())
      .then(data => {
        data.features = data.features.filter(f => f.geometry !== null);
        setAdmin1(data);
      });

    fetch(`${import.meta.env.BASE_URL}cities.geojson`)
      .then(res => res.json())
      .then(data => setCities(data));
  }, []);

  const countryByCode = useMemo(() => {
    const map = {};
    countries.features.forEach((c) => {
      map[c.properties.ADM0_A3] = c;
    });
    return map;
  }, [countries]);

  const isRegionFeature = (d) => !!d.properties.iso_3166_2;
  const letterOf = (d) =>
    (isRegionFeature(d) ? d.properties.name : d.properties.ADMIN)?.[0]?.toUpperCase();

  const ownRegions = selectedCountry && drilledIn
    ? admin1.features.filter(
        (r) => r.properties.adm0_a3 === selectedCountry.properties.ADM0_A3
      )
    : [];

  const letterMatchedRegions = selectedLetter
    ? admin1.features.filter((r) => {
        if (r.properties.name?.[0]?.toUpperCase() !== selectedLetter) return false;
        const parentCountry = countryByCode[r.properties.adm0_a3];
        const parentLetter = parentCountry?.properties.ADMIN?.[0]?.toUpperCase();
        return parentLetter !== selectedLetter;
      })
    : [];

  const displayedRegions = useMemo(() => {
    const map = new Map();
    [...ownRegions, ...letterMatchedRegions].forEach((r) => {
      const key = `${r.properties.adm0_a3}-${r.properties.name}`;
      map.set(key, r);
    });
    return Array.from(map.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCountry, drilledIn, selectedLetter, admin1]);

  const letterMatchedCities = useMemo(() => {
    if (!selectedLetter || !showCities) return [];
    return cities.features.filter(
      (c) => c.properties.name?.[0]?.toUpperCase() === selectedLetter
    );
  }, [cities, selectedLetter, showCities]);

  const handleCountryClick = (country) => {
    const isSameCountry = selectedCountry && selectedCountry.properties.ADM0_A3 === country.properties.ADM0_A3;

    if (isSameCountry && !drilledIn) {
      setDrilledIn(true);
      return;
    }
    if (isSameCountry && drilledIn) {
      return;
    }

    setSelectedCountry(country);
    setSelectedRegion(null);
    setSelectedCity(null);
    setDrilledIn(false);
    setSelectedLetter(country.properties.ADMIN?.[0]?.toUpperCase());

    if (globeRef.current) {
      const coords = getCentroid(country);
      globeRef.current.pointOfView({ lat: coords[1], lng: coords[0], altitude: 1.5 }, 1000);
    }

    fetch(`${API_URL}/api/countries/${country.properties.ISO_A2}/facts`)
      .then(res => res.json())
      .then(data => {
        setFacts(data.facts);
        setSourceUrl(data.sourceUrl || null);
      })
      .catch(() => { setFacts([]); setSourceUrl(null); });
  };

  const handleRegionClick = (region) => {
    setSelectedRegion(region);
    setSelectedCity(null);
    setSelectedLetter(region.properties.name?.[0]?.toUpperCase());
    setDrilledIn(true);

    const parentCountry = countryByCode[region.properties.adm0_a3];
    if (parentCountry) setSelectedCountry(parentCountry);

    if (globeRef.current) {
      const coords = getCentroid(region);
      globeRef.current.pointOfView({ lat: coords[1], lng: coords[0], altitude: 0.5 }, 1000);
    }

    const id = stableId(region.properties.adm0_a3, region.properties.name);
    fetch(`${API_URL}/api/regions/${id}/facts`)
      .then(res => res.json())
      .then(data => {
        setFacts(data.facts);
        setSourceUrl(data.sourceUrl || null);
      })
      .catch(() => { setFacts([]); setSourceUrl(null); });
  };

  const handleCityClick = (city) => {
    setSelectedCity(city);
    setSelectedLetter(city.properties.name?.[0]?.toUpperCase());

    const parentCountry = countryByCode[city.properties.adm0_a3];
    if (parentCountry) setSelectedCountry(parentCountry);
    setSelectedRegion(null);

    if (globeRef.current) {
      const [lng, lat] = city.geometry.coordinates;
      globeRef.current.pointOfView({ lat, lng, altitude: 0.3 }, 1000);
    }

    const id = stableId(city.properties.adm0_a3, city.properties.name);
    fetch(`${API_URL}/api/cities/${id}/facts`)
      .then(res => res.json())
      .then(data => {
        setFacts(data.facts);
        setSourceUrl(data.sourceUrl || null);
      })
      .catch(() => { setFacts([]); setSourceUrl(null); });
  };

  const handleBackToCountry = () => {
    setSelectedRegion(null);
    setSelectedCity(null);
    if (selectedCountry) {
      setSelectedLetter(selectedCountry.properties.ADMIN?.[0]?.toUpperCase());
    }
  };

  const handleLetterClick = (letter) => {
    setSelectedLetter(prev => (prev === letter ? null : letter));
    setSelectedCountry(null);
    setSelectedRegion(null);
    setSelectedCity(null);
    setDrilledIn(false);
    setFacts([]);
    setSourceUrl(null);
  };

  const COUNTRY_ALT = 0.006;
  const REGION_ALT = 0.01;

  const getAltitude = (d) => {
    if (!isRegionFeature(d)) return COUNTRY_ALT;
    const letterMatches = selectedLetter && letterOf(d) === selectedLetter;
    return letterMatches ? REGION_ALT + 0.003 : REGION_ALT;
  };

  const getCapColor = (d) => {
    const isRegion = isRegionFeature(d);

    if (isRegion) {
      if (d === selectedRegion) return 'rgba(255, 200, 50, 0.9)';
      if (selectedLetter && letterOf(d) === selectedLetter) return 'rgba(255, 170, 60, 0.75)';
      return 'rgba(255, 255, 255, 0.25)';
    }

    const letterMatches = selectedLetter && letterOf(d) === selectedLetter;
    return letterMatches ? 'rgba(255, 100, 50, 0.6)' : 'rgba(200, 200, 200, 0.3)';
  };

  const getPointColor = (d) =>
    d === selectedCity ? '#FFD700' : '#D4A24C';

  const getPointRadius = (d) =>
    d === selectedCity ? 0.55 : 0.35;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden', background: '#050B14' }}>
      <Globe
        ref={globeRef}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
        backgroundColor="#050B14"
        polygonsData={[...countries.features, ...displayedRegions]}
        polygonCapColor={getCapColor}
        polygonAltitude={getAltitude}
        polygonSideColor={() => 'rgba(0, 100, 200, 0.15)'}
        polygonStrokeColor={() => '#111'}
        polygonLabel={(d) => d.properties.name || d.properties.ADMIN}
        onPolygonClick={(d) => {
          isRegionFeature(d) ? handleRegionClick(d) : handleCountryClick(d);
        }}
        polygonsTransitionDuration={300}
        pointsData={letterMatchedCities}
        pointLat={(d) => d.geometry.coordinates[1]}
        pointLng={(d) => d.geometry.coordinates[0]}
        pointColor={getPointColor}
        pointAltitude={0.02}
        pointRadius={getPointRadius}
        pointLabel={(d) => d.properties.name}
        pointsMerge={false}
        onPointClick={handleCityClick}
      />

      <div style={sidebarStyle}>
        <div style={sidebarLabelStyle}>INDEX</div>

        <button
          onClick={() => setShowCities((v) => !v)}
          style={cityToggleStyle(showCities)}
          title={showCities ? 'Hide cities' : 'Show cities'}
        >
          <span style={cityToggleDotStyle(showCities)} />
          CITIES
        </button>

        {ALPHABET.map((letter) => (
          <div key={letter} style={rulerRowStyle}>
            <div style={{ ...tickStyle, opacity: selectedLetter === letter ? 1 : 0.25 }} />
            <button
              onClick={() => handleLetterClick(letter)}
              style={{
                ...letterButtonStyle,
                color: selectedLetter === letter ? '#050B14' : '#7FA8C9',
                background: selectedLetter === letter ? '#ff6432' : 'transparent',
                fontWeight: selectedLetter === letter ? 600 : 400,
              }}
            >
              {letter}
            </button>
          </div>
        ))}
      </div>

      {(selectedCountry || selectedRegion || selectedCity) && (
        <div style={panelStyle}>
          <div style={panelAccentBar} />
          {(selectedRegion || selectedCity) && (
            <button onClick={handleBackToCountry} style={backButtonStyle}>
              ← {selectedCountry?.properties.ADMIN}
            </button>
          )}
          <div style={eyebrowStyle}>
            {selectedCity ? 'CITY' : selectedRegion ? 'REGION' : 'COUNTRY'}
          </div>
          <h2 style={headingStyle}>
            {selectedCity
              ? selectedCity.properties.name
              : selectedRegion
              ? selectedRegion.properties.name
              : selectedCountry.properties.ADMIN}
          </h2>
          {!selectedRegion && !selectedCity && !drilledIn && (
            <p style={hintStyle}>Click again to explore regions</p>
          )}
          {facts.length > 0 ? (
            <>
              <ul style={factListStyle}>
                {facts.map((f, i) => <li key={i} style={factItemStyle}>{f}</li>)}
              </ul>
              {sourceUrl && (
                <a href={sourceUrl} target="_blank" rel="noopener noreferrer" style={sourceLinkStyle}>
                  Source: Wikipedia ↗
                </a>
              )}
            </>
          ) : (
            <p style={emptyStateStyle}>No facts loaded yet — hook up the backend pipeline.</p>
          )}
        </div>
      )}
    </div>
  );
}

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

const ALPHABET = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));

const panelStyle = {
  position: 'absolute',
  top: 20,
  right: 20,
  width: 320,
  maxHeight: '80vh',
  overflowY: 'auto',
  background: '#0F2440',
  border: '1px solid #2A4A6E',
  color: '#EDE6D6',
  padding: '20px 24px',
  borderRadius: 4,
  fontFamily: "'Space Grotesk', sans-serif",
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
};

const panelAccentBar = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: 3,
  background: 'linear-gradient(90deg, #D4A24C, transparent)',
};

const eyebrowStyle = {
  fontSize: 11,
  letterSpacing: '0.12em',
  color: '#D4A24C',
  fontWeight: 500,
  marginTop: 4,
  marginBottom: 4,
};

const headingStyle = {
  fontFamily: "'Fraunces', serif",
  fontSize: 28,
  fontWeight: 500,
  margin: '0 0 12px 0',
  color: '#EDE6D6',
  lineHeight: 1.15,
};

const backButtonStyle = {
  background: 'none',
  border: 'none',
  color: '#7FA8C9',
  fontFamily: "'Space Grotesk', sans-serif",
  fontSize: 13,
  cursor: 'pointer',
  padding: 0,
  marginBottom: 10,
  display: 'block',
};

const hintStyle = {
  opacity: 0.65,
  fontSize: 13,
  fontStyle: 'italic',
  color: '#7FA8C9',
  margin: '0 0 12px 0',
};

const factListStyle = {
  paddingLeft: 18,
  margin: 0,
};

const factItemStyle = {
  fontSize: 14,
  lineHeight: 1.6,
  marginBottom: 8,
  color: '#EDE6D6',
};

const emptyStateStyle = {
  fontSize: 13,
  color: '#7FA8C9',
  fontStyle: 'italic',
};

const sourceLinkStyle = {
  display: 'inline-block',
  marginTop: 14,
  fontSize: 12,
  color: '#7FA8C9',
  textDecoration: 'none',
  borderTop: '1px solid #2A4A6E',
  paddingTop: 10,
  width: '100%',
};

const sidebarStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  height: '100vh',
  width: 56,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 1,
  background: 'rgba(15, 36, 64, 0.7)',
  borderRight: '1px solid #2A4A6E',
  backdropFilter: 'blur(6px)',
  fontFamily: "'Space Grotesk', sans-serif",
};

const sidebarLabelStyle = {
  position: 'absolute',
  top: 24,
  left: '50%',
  transform: 'translateX(-50%) rotate(-90deg)',
  transformOrigin: 'center',
  fontSize: 10,
  letterSpacing: '0.2em',
  color: '#D4A24C',
  whiteSpace: 'nowrap',
};

const rulerRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
};

const tickStyle = {
  width: 6,
  height: 1,
  background: '#D4A24C',
};

const letterButtonStyle = {
  border: 'none',
  fontSize: 11,
  fontFamily: "'Space Grotesk', sans-serif",
  cursor: 'pointer',
  width: 22,
  height: 18,
  borderRadius: 3,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'background 0.15s ease',
};

const cityToggleStyle = (active) => ({
  writingMode: 'vertical-rl',
  textOrientation: 'mixed',
  border: `1px solid ${active ? '#D4A24C' : '#2A4A6E'}`,
  background: active ? 'rgba(212, 162, 76, 0.12)' : 'transparent',
  color: active ? '#D4A24C' : '#7FA8C9',
  fontFamily: "'Space Grotesk', sans-serif",
  fontSize: 9,
  letterSpacing: '0.1em',
  cursor: 'pointer',
  borderRadius: 3,
  padding: '10px 4px',
  marginBottom: 16,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
  transition: 'all 0.15s ease',
});

const cityToggleDotStyle = (active) => ({
  width: 5,
  height: 5,
  borderRadius: '50%',
  background: active ? '#D4A24C' : '#3A5A7E',
  flexShrink: 0,
});

export default App;
