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
let vertices = [];     // Marcadores en el mapa
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
      mostrarInfo(`Ubicacion encontrada (precision: ${Math.round(accuracy)} m). Haz clic para dibujar.`);
    },
    (err) => {
      const mensajes = {
        1: 'Permiso denegado. Activa la ubicacion en el navegador.',
        2: 'No se pudo determinar la ubicacion.',
        3: 'Se agoto el tiempo de espera.'
      };
      mostrarInfo(mensajes[err.code] || 'Error desconocido.');
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

// Reto 4: Agregar vertice con la ubicacion actual del GPS
function agregarVerticeGPS() {
  if (!('geolocation' in navigator)) {
    mostrarInfo('Tu navegador no soporta geolocalizacion.');
    return;
  }

  mostrarInfo('Obteniendo coordenadas GPS para el vertice...');

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      agregarPunto(latitude, longitude);
      mapa.setView([latitude, longitude], 17);
      mostrarInfo(`Vertice GPS agregado: [${latitude.toFixed(6)}, ${longitude.toFixed(6)}]`);
    },
    (err) => {
      mostrarInfo('Error al obtener ubicacion GPS para el vertice.');
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

// Funcion central para añadir puntos (usada por clics, GPS y recarga)
function agregarPunto(lat, lng) {
  if (poligono) return;

  puntos.push([lat, lng]);

  const colorSeleccionado = document.getElementById('inputColor').value;
  const v = L.circleMarker([lat, lng], { radius: 6, color: colorSeleccionado, fillOpacity: 1 }).addTo(mapa);
  vertices.push(v);

  lineaGuia.setStyle({ color: colorSeleccionado });
  lineaGuia.setLatLngs(puntos);
  
  actualizarTabla();
  actualizarBotones();
  guardarEnLocalStorage(); // Reto 5
  mostrarInfo(`${puntos.length} vertice(s). Necesitas al menos 3 para cerrar el poligono.`);
}

// Reto 1: Actualizar la tabla HTML de coordenadas
function actualizarTabla() {
  const tbody = document.getElementById('tablaVerticesBody');
  tbody.innerHTML = '';

  if (puntos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #777;">No hay vertices aún</td></tr>';
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

mapa.on('click', (e) => {
  agregarPunto(e.latlng.lat, e.latlng.lng);
});

function actualizarBotones() {
  document.getElementById('btnCerrar').disabled = puntos.length < 3 || poligono !== null;
  document.getElementById('btnDeshacer').disabled = puntos.length === 0 || poligono !== null;
  document.getElementById('btnExportar').disabled = poligono === null;
}

// Reto 3: GeoJSON incluyendo el nombre personalizado del input
function aGeoJSON() {
  const anillo = puntos.map(([lat, lng]) => [lng, lat]);
  anillo.push(anillo[0]); // Cerrar el anillo
  
  // Obtener el nombre actual ingresado en la caja de texto
  const nombreIngresado = document.getElementById('inputNombre').value.trim();
  const nombreFinal = nombreIngresado !== '' ? nombreIngresado : 'Mi polígono';

  return turf.polygon([anillo], { 
    nombre: nombreFinal, 
    creado: new Date().toISOString() 
  });
}

function medir() {
  const geo = aGeoJSON();
  const area = turf.area(geo);
  const perimetro = turf.length(turf.polygonToLine(geo), { units: 'meters' });
  return { area, perimetro };
}

function cerrarPoligono() {
  const colorSeleccionado = document.getElementById('inputColor').value;
  // Reto 3: Obtener el nombre ingresado en el input
  const nombrePoligono = document.getElementById('inputNombre').value || 'Mi polígono';
  
  poligono = L.polygon(puntos, { color: colorSeleccionado, fillOpacity: 0.35 }).addTo(mapa);
  lineaGuia.setLatLngs([]);
  mapa.fitBounds(poligono.getBounds());

  const { area, perimetro } = medir();

  // Se añade el nombre al contenido del Popup
  poligono.bindPopup(`
    <b>${nombrePoligono}</b><br>
    <b>Area:</b> ${area.toFixed(1)} m²<br>
    <b>PerImetro:</b> ${perimetro.toFixed(1)} m
  `).openPopup();
  
  mostrarInfo(`PolIgono "${nombrePoligono}" cerrado. Area: ${area.toFixed(1)} m² (${(area / 10000).toFixed(3)} ha).`);
  actualizarBotones();
  guardarEnLocalStorage();
}

function deshacerPunto() {
  puntos.pop();
  const ultimoVertice = vertices.pop();
  if (ultimoVertice) mapa.removeLayer(ultimoVertice);

  lineaGuia.setLatLngs(puntos);
  actualizarTabla();
  actualizarBotones();
  guardarEnLocalStorage(); // Reto 5
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

  actualizarTabla();
  actualizarBotones();
  localStorage.removeItem('poligono_guardado'); // Reto 5
  mostrarInfo('Mapa limpio. Haz clic para empezar de nuevo.');
}

// Reto 5: Metodos de localStorage
function guardarEnLocalStorage() {
  const estado = {
    puntos,
    nombre: document.getElementById('inputNombre').value,
    cerrado: poligono !== null
  };
  localStorage.setItem('poligono_guardado', JSON.stringify(estado));
}

function cargarDesdeLocalStorage() {
  const datosGuardados = localStorage.getItem('poligono_guardado');
  if (!datosGuardados) return;

  try {
    const { puntos: puntosGuardados, nombre, cerrado } = JSON.parse(datosGuardados);
    if (nombre) document.getElementById('inputNombre').value = nombre;
    
    if (Array.isArray(puntosGuardados)) {
      puntosGuardados.forEach(([lat, lng]) => agregarPunto(lat, lng));
      if (cerrado && puntos.length >= 3) {
        cerrarPoligono();
      }
    }
  } catch (err) {
    console.error('Error cargando desde localStorage:', err);
  }
}

// Reto 6: Importar archivo GeoJSON
function importarGeoJSON(e) {
  const archivo = e.target.files[0];
  if (!archivo) return;

  const lector = new FileReader();
  lector.onload = (evento) => {
    try {
      const geojson = JSON.parse(evento.target.result);
      
      let coordenadas = [];
      if (geojson.type === 'Feature' && geojson.geometry.type === 'Polygon') {
        coordenadas = geojson.geometry.coordinates[0];
      } else if (geojson.type === 'Polygon') {
        coordenadas = geojson.coordinates[0];
      } else {
        alert('El archivo debe contener un Polygon GeoJSON valido.');
        return;
      }

      limpiar(); // Se limpia el estado actual antes de importar
      
      // GeoJSON guarda en formato [lng, lat], invertimos a [lat, lng]
      // Ignoramos el último punto duplicado si cierra el anillo
      const puntosInvertidos = coordenadas.map(([lng, lat]) => [lat, lng]);
      if (puntosInvertidos.length > 3 && 
          puntosInvertidos[0][0] === puntosInvertidos[puntosInvertidos.length - 1][0] &&
          puntosInvertidos[0][1] === puntosInvertidos[puntosInvertidos.length - 1][1]) {
        puntosInvertidos.pop();
      }

      puntosInvertidos.forEach(([lat, lng]) => agregarPunto(lat, lng));
      cerrarPoligono();
      mostrarInfo('Archivo GeoJSON cargado con exito.');
    } catch (err) {
      alert('Error al procesar el archivo GeoJSON.');
    }
  };
  lector.readAsText(archivo);
}

function exportar() {
  const texto = JSON.stringify(aGeoJSON(), null, 2);
  const blob = new Blob([texto], { type: 'application/geo+json' });
  const enlace = document.createElement('a');

  enlace.href = URL.createObjectURL(blob);
  enlace.download = `${document.getElementById('inputNombre').value || 'poligono'}.geojson`;
  enlace.click();

  setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
}

// Reto 2: Evento para cambiar dinamicamente el color
document.getElementById('inputColor').addEventListener('input', (e) => {
  const nuevoColor = e.target.value;
  if (poligono) poligono.setStyle({ color: nuevoColor });
  lineaGuia.setStyle({ color: nuevoColor });
  vertices.forEach((v) => v.setStyle({ color: nuevoColor }));
});

// Guardar el nombre cuando cambia
document.getElementById('inputNombre').addEventListener('input', guardarEnLocalStorage);

// Listeners de los botones
document.getElementById('btnUbicar').addEventListener('click', ubicarUsuario);
document.getElementById('btnAgregarGPS').addEventListener('click', agregarVerticeGPS);
document.getElementById('btnCerrar').addEventListener('click', cerrarPoligono);
document.getElementById('btnDeshacer').addEventListener('click', deshacerPunto);
document.getElementById('btnLimpiar').addEventListener('click', limpiar);
document.getElementById('btnExportar').addEventListener('click', exportar);
document.getElementById('inputImportar').addEventListener('change', importarGeoJSON);

// Cargar estado guardado previa o iniciar con geolocalizacion
cargarDesdeLocalStorage();
if (puntos.length === 0) {
  ubicarUsuario();
}