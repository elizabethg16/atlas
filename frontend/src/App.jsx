import { useState, useRef, useEffect, useMemo } from 'react';
import Globe from 'react-globe.gl';
import './App.css';

function App() {
  const globeRef = useRef();

  const [countries, setCountries] = useState({ features: [] });
  const [admin1, setAdmin1] = useState({ features: [] });
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [selectedLetter, setSelectedLetter] = useState(null);
  const [drilledIn, setDrilledIn] = useState(false); // true once the user has clicked the selected country a 2nd time
  const [facts, setFacts] = useState([]);

  // Load GeoJSON on mount
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
  }, []);

  // Quick lookup: country ADM0_A3 code -> country feature (used to find a region's parent country)
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

  // Regions belonging to the currently drilled-into country - only shown once the user
  // has clicked the already-selected country a second time, NOT immediately on first click.
  // This is what lets the country itself stay fully visible (nothing rendered on top of it)
  // while it's just "selected" but not yet "drilled into."
  const ownRegions = selectedCountry && drilledIn
    ? admin1.features.filter(
        (r) => r.properties.adm0_a3 === selectedCountry.properties.ADM0_A3
      )
    : [];

  // Regions anywhere in the world that match the active letter -
  // skip any whose parent country ALSO starts with that letter, since the whole country
  // is already highlighted and re-highlighting one of its regions would be redundant
  const letterMatchedRegions = selectedLetter
    ? admin1.features.filter((r) => {
        if (r.properties.name?.[0]?.toUpperCase() !== selectedLetter) return false;
        const parentCountry = countryByCode[r.properties.adm0_a3];
        const parentLetter = parentCountry?.properties.ADMIN?.[0]?.toUpperCase();
        return parentLetter !== selectedLetter;
      })
    : [];

  // Merge + dedupe (a region could show up in both lists above)
  const displayedRegions = useMemo(() => {
    const map = new Map();
[...ownRegions, ...letterMatchedRegions].forEach((r) => {
  const key = `${r.properties.adm0_a3}-${r.properties.name}`; // always unique - iso_3166_2 isn't reliable (e.g. UK regions all share 'GB')
  map.set(key, r);
});
    return Array.from(map.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCountry, drilledIn, selectedLetter, admin1]);

  const handleCountryClick = (country) => {
    const isSameCountry = selectedCountry && selectedCountry.properties.ADM0_A3 === country.properties.ADM0_A3;

    if (isSameCountry && !drilledIn) {
      // Second click on the already-selected country - now reveal its regions
      setDrilledIn(true);
      return;
    }
    if (isSameCountry && drilledIn) {
      return; // already drilled in - region clicks take over from here
    }

    // Clicking a brand new country - select it flat/highlighted, not yet drilled in
    setSelectedCountry(country);
    setSelectedRegion(null);
    setDrilledIn(false);
    setSelectedLetter(country.properties.ADMIN?.[0]?.toUpperCase());

    if (globeRef.current) {
      const coords = getCentroid(country);
      globeRef.current.pointOfView({ lat: coords[1], lng: coords[0], altitude: 1.5 }, 1000);
    }

    fetch(`http://localhost:3001/api/countries/${country.properties.ISO_A2}/facts`)
      .then(res => res.json())
      .then(data => setFacts(data.facts))
      .catch(() => setFacts([]));
  };

  const handleRegionClick = (region) => {
    setSelectedRegion(region);
    setSelectedLetter(region.properties.name?.[0]?.toUpperCase());
    setDrilledIn(true);

    // A region can now be reached either via drill-down or via letter-highlighting from
    // another country entirely - make sure the panel/back-button/camera stay in sync either way
    const parentCountry = countryByCode[region.properties.adm0_a3];
    if (parentCountry) setSelectedCountry(parentCountry);

    if (globeRef.current) {
      const coords = getCentroid(region);
      globeRef.current.pointOfView({ lat: coords[1], lng: coords[0], altitude: 0.5 }, 1000);
    }

    fetch(`http://localhost:3001/api/regions/${region.properties.iso_3166_2}/facts`)
      .then(res => res.json())
      .then(data => setFacts(data.facts))
      .catch(() => setFacts([]));
  };

  const handleBackToCountry = () => {
    setSelectedRegion(null);
    if (selectedCountry) {
      setSelectedLetter(selectedCountry.properties.ADMIN?.[0]?.toUpperCase());
    }
  };

  const handleLetterClick = (letter) => {
    setSelectedLetter(prev => (prev === letter ? null : letter));
    setSelectedCountry(null);
    setSelectedRegion(null);
    setDrilledIn(false);
    setFacts([]);
  };

  // Countries stay flat at all times - this is what guarantees region clicks always work,
  // since a country can never rise above (and block clicks on) its own regions
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
      if (selectedCountry && d.properties.adm0_a3 === selectedCountry.properties.ADM0_A3) {
        return 'rgba(255, 140, 90, 0.45)'; // belongs to the drilled-into country
      }
      return 'rgba(255, 255, 255, 0.25)';
    }

    // A country's cap is only ever covered once its OWN regions render on top of it -
    // and now that only happens after drilledIn, a selected-but-not-yet-drilled country
    // is fully visible and gets the exact same treatment as any other letter match
    const letterMatches = selectedLetter && letterOf(d) === selectedLetter;
    return letterMatches ? 'rgba(255, 100, 50, 0.6)' : 'rgba(200, 200, 200, 0.3)';
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <Globe
        ref={globeRef}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
        backgroundColor="#000000"
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

      {(selectedCountry || selectedRegion) && (
        <div style={panelStyle}>
          {selectedRegion && (
            <button onClick={handleBackToCountry} style={{ marginBottom: 8 }}>
              ← Back to {selectedCountry?.properties.ADMIN}
            </button>
          )}
          <h2>{selectedRegion ? selectedRegion.properties.name : selectedCountry.properties.ADMIN}</h2>
          {!selectedRegion && !drilledIn && (
            <p style={{ opacity: 0.7, fontSize: 13 }}>Click again to see regions</p>
          )}
          {facts.length > 0 ? (
            <ul>{facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
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
