import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

// Fix default marker paths in Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

function FitBounds({ doctors }) {
  const map = useMap();
  useEffect(() => {
    const pts = doctors
      .filter((d) => d.latitude != null && d.longitude != null)
      .map((d) => [d.latitude, d.longitude]);
    if (pts.length === 1) {
      map.setView(pts[0], 11);
    } else if (pts.length > 1) {
      map.fitBounds(pts, { padding: [40, 40], maxZoom: 12 });
    }
  }, [doctors, map]);
  return null;
}

export default function DoctorsMap({ doctors, onSelectDoctor, selectedId }) {
  const mappable = useMemo(
    () => doctors.filter((d) => d.latitude != null && d.longitude != null),
    [doctors]
  );

  if (mappable.length === 0) {
    return (
      <div className="h-64 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-center text-sm text-slate-500">
        No map coordinates for these doctors.
      </div>
    );
  }

  const center = [mappable[0].latitude, mappable[0].longitude];

  return (
    <div className="h-80 rounded-2xl overflow-hidden border border-slate-200 shadow-sm z-0">
      <MapContainer center={center} zoom={5} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds doctors={mappable} />
        {mappable.map((d) => (
          <Marker key={d.id} position={[d.latitude, d.longitude]}>
            <Popup>
              <div className="text-sm min-w-[160px]">
                <p className="font-bold text-slate-800">{d.full_name || d.name}</p>
                <p className="text-teal-700 text-xs font-medium">{d.specialization}</p>
                <p className="text-slate-500 text-xs mt-1">{d.hospital_name}</p>
                <p className="text-slate-500 text-xs">{[d.city, d.state].filter(Boolean).join(', ')}</p>
                {onSelectDoctor && (
                  <button
                    type="button"
                    onClick={() => onSelectDoctor(d)}
                    className="mt-2 w-full bg-teal-600 text-white text-xs font-semibold py-1.5 rounded-lg hover:bg-teal-700"
                  >
                    Request appointment
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      {selectedId && (
        <p className="text-[10px] text-slate-400 mt-1 px-1">Selected doctor highlighted in list below</p>
      )}
    </div>
  );
}
