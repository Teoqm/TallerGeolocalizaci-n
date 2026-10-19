// Paso 2: Inicializar Mapa (Centro por defecto: Manizales)
const CENTRO_INICIAL = [5.0689, -75.5174];
const mapa = L.map('mapa').setView(CENTRO_INICIAL, 15);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(mapa);

// Variables de Estado
let marcadorUsuario = null;
let circuloPrecision = null;
let puntos = [];       // Array de [lat, lng]
let vertices = [];     // Marcadores en el mapa de cada punto
let poligono = null;   // Poligono en Leaflet

const lineaGuia = L.polyline([], { color: '#e67e22', dashArray: '6 6' }).addTo(mapa);

function mostrarInfo(texto) {
  document.getElementById('info').textContent = texto;
}

// Paso 3: Geolocalizacion del usuario
function ubicarUsuario() {
  if (!('geolocation' in navigator)) {
    mostrarInfo('Tu navegador no soporta geolocalizacion.');
    return;
  }

  mostrarInfo('Buscando tu ubicacion...');

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      const punto = [latitude, longitude];

      if (marcadorUsuario) mapa.removeLayer(marcadorUsuario);
      if (circuloPrecision) mapa.removeLayer(circuloPrecision);

      marcadorUsuario = L.marker(punto).addTo(mapa).bindPopup('Estas aqui').openPopup();
      circuloPrecision = L.circle(punto, { radius: accuracy, fillOpacity: 0.1 }).addTo(mapa);
      
      mapa.setView(punto, 17);
      mostrarInfo(`Ubicacion encontrada (precision: ${Math.round(accuracy)} m). Haz clic en el mapa para dibujar.`);
    },
    (err) => {
      const mensajes = {
        1: 'Permiso denegado. Activa la ubicacion en el navegador.',
        2: 'No se pudo determinar la ubicacion.',
        3: 'Se agoto el tiempo de espera.'
      };
      mostrarInfo(mensajes[err.code] || 'Error desconocido al obtener la ubicacion.');
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

// Reto 1: Funcion para actualizar la tabla HTML de coordenadas
function actualizarTabla() {
  const tbody = document.getElementById('tablaVerticesBody');
  tbody.innerHTML = '';

  if (puntos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #777;">No hay vertices aun</td></tr>';
    return;
  }

  puntos.forEach(([lat, lng], index) => {
    const fila = document.createElement('tr');
    fila.innerHTML = `
      <td><b>${index + 1}</b></td>
      <td>${lat.toFixed(6)}</td>
      <td>${lng.toFixed(6)}</td>
    `;
    tbody.appendChild(fila);
  });
}

// Paso 4: Capturar vertices con clics en el mapa
mapa.on('click', (e) => {
  if (poligono) return;

  const { lat, lng } = e.latlng;
  puntos.push([lat, lng]);

  const colorSeleccionado = document.getElementById('inputColor').value;
  const v = L.circleMarker([lat, lng], { radius: 6, color: colorSeleccionado, fillOpacity: 1 }).addTo(mapa);
  vertices.push(v);

  lineaGuia.setStyle({ color: colorSeleccionado });
  lineaGuia.setLatLngs(puntos);
  
  actualizarTabla(); // Actualiza la tabla de vertices
  actualizarBotones();
  mostrarInfo(`${puntos.length} vertice(s). Necesitas al menos 3 para cerrar el poligono.`);
});

function actualizarBotones() {
  document.getElementById('btnCerrar').disabled = puntos.length < 3 || poligono !== null;
  document.getElementById('btnDeshacer').disabled = puntos.length === 0 || poligono !== null;
  document.getElementById('btnExportar').disabled = poligono === null;
}

// Paso 5: Conversion a GeoJSON y Medicion con Turf.js
function aGeoJSON() {
  const anillo = puntos.map(([lat, lng]) => [lng, lat]);
  anillo.push(anillo[0]);
  return turf.polygon([anillo], { nombre: 'Mi poligono', creado: new Date().toISOString() });
}

function medir() {
  const geo = aGeoJSON();
  const area = turf.area(geo);
  const perimetro = turf.length(turf.polygonToLine(geo), { units: 'meters' });
  return { area, perimetro };
}

function cerrarPoligono() {
  const colorSeleccionado = document.getElementById('inputColor').value;
  
  poligono = L.polygon(puntos, { color: colorSeleccionado, fillOpacity: 0.35 }).addTo(mapa);
  lineaGuia.setLatLngs([]);
  mapa.fitBounds(poligono.getBounds());

  const { area, perimetro } = medir();
  poligono.bindPopup(`<b>area:</b> ${area.toFixed(1)} m²<br><b>Perimetro:</b> ${perimetro.toFixed(1)} m`).openPopup();
  
  mostrarInfo(`Poligono cerrado. area: ${area.toFixed(1)} m² (${(area / 10000).toFixed(3)} ha).`);
  actualizarBotones();
}

// Paso 6: Deshacer punto y Limpiar mapa
function deshacerPunto() {
  puntos.pop();
  const ultimoVertice = vertices.pop();
  if (ultimoVertice) mapa.removeLayer(ultimoVertice);

  lineaGuia.setLatLngs(puntos);
  actualizarTabla(); // Actualiza la tabla al deshacer
  actualizarBotones();
  mostrarInfo(`${puntos.length} vertice(s).`);
}

function limpiar() {
  puntos = [];
  vertices.forEach((v) => mapa.removeLayer(v));
  vertices = [];
  lineaGuia.setLatLngs([]);

  if (poligono) {
    mapa.removeLayer(poligono);
    poligono = null;
  }

  actualizarTabla(); // Limpia la tabla
  actualizarBotones();
  mostrarInfo('Mapa limpio. Haz clic para empezar de nuevo.');
}

// Paso 7: Exportar GeoJSON
function exportar() {
  const texto = JSON.stringify(aGeoJSON(), null, 2);
  const blob = new Blob([texto], { type: 'application/geo+json' });
  const enlace = document.createElement('a');

  enlace.href = URL.createObjectURL(blob);
  enlace.download = 'poligono.geojson';
  enlace.click();

  setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
}

// Reto 2: Evento para cambiar dinámicamente el color del poligono o vertices
document.getElementById('inputColor').addEventListener('input', (e) => {
  const nuevoColor = e.target.value;
  
  // Cambiar color del poligono si ya está cerrado
  if (poligono) {
    poligono.setStyle({ color: nuevoColor });
  }

  // Cambiar color de la linea guia y los vertices
  lineaGuia.setStyle({ color: nuevoColor });
  vertices.forEach((v) => v.setStyle({ color: nuevoColor }));
});

// Listeners de los botones
document.getElementById('btnUbicar').addEventListener('click', ubicarUsuario);
document.getElementById('btnCerrar').addEventListener('click', cerrarPoligono);
document.getElementById('btnDeshacer').addEventListener('click', deshacerPunto);
document.getElementById('btnLimpiar').addEventListener('click', limpiar);
document.getElementById('btnExportar').addEventListener('click', exportar);

// Geolocalizacion inicial
ubicarUsuario();