# Cambios Frontend — Sesión actual

---

## Módulo: Registro de Maletas
**Ruta:** `pages/modules/registro-maletas/components/maleta/`

### `maleta.component.ts`
- Eliminado campo **aerolínea** del formulario y CSV (ahora 3 cols: origen, destino, cantidad)
- Eliminado campo **prioridad** de la lista
- `crearEnvio()` solo envía `{ idAeropuertoOrigen, idAeropuertoDestino, cantidad }`
- CSV: detecta delimitador `,` o `;`; valida 3 columnas; lookup por `codigoOaci`

### `maleta.component.html`
- Eliminado `<p-select>` de aerolínea del formulario
- Eliminado `<th>Prioridad</th>` y `<td>{{ e.prioridad }}</td>` de la tabla
- `colspan` corregido a 6 (Origen, Destino, Maletas, Estado, Fecha Registro, Fecha Límite)
- Hint CSV actualizado: `origen (OACI), destino (OACI), cantidad`

### `envio.service.ts` (`core/services/`)
- `crearEnvio` body type: eliminado `idAerolinea`

---

## Módulo: Simulación
**Ruta:** `pages/modules/simulacion/components/simulacion/`

### `simulacion.component.ts` — cambios clave

#### Arcos visibles — solo vuelos EN_VUELO
```typescript
get arcosVisibles(): ArcoVuelo[] {
  return this.arcosVuelo.filter(a => a.estado === 'EN_VUELO');
}
```
Antes mostraba PENDIENTE + EN_VUELO. Ahora la línea aparece cuando el avión despega y desaparece al aterrizar.

#### Auto-play al terminar SSE (`fin` event)
Al recibir `fin` del backend: detiene el streaming, rebobina a `tiempoInicioMs`, recalcula arcos y llama `iniciar()` automáticamente. El usuario ve la simulación reproducirse desde el día 1 sin tener que pulsar "Reanudar".

#### Botón "Detener" → solo pausa
Llama `detener()` (para el interval, `reproduciendo=false`) en vez de `detenerTodo()` (que reseteaba todo).  
Para iniciar nueva simulación: engranaje ⚙ → "Ejecutar Simulación".

#### Cancelar vuelo → Reprogramar envíos (2 fases)
**Propiedades nuevas:**
```typescript
cancelacionExitosa  = false;
codigoVueloCancelado = '';
```

**Fase 1** (confirmación): igual que antes.

**Fase 2** (tras cancelación exitosa): muestra ✔ y botones "Más tarde" / "Reprogramar envíos".

**`reprogramarEnvios()`:** resetea UI, llama `iniciarStreaming()` directamente (sin re-importar vuelos/envíos). El ALNS corre con el vuelo ya marcado CANCELADO en BD, buscando rutas alternativas.

**`cerrarDialogoCancelacion()`:** centraliza el cierre del diálogo y reset de flags.

Ambos métodos de reset (`ejecutarSimulacion` y `detenerTodo`) también limpian `cancelacionExitosa` y `codigoVueloCancelado`.

### `simulacion.component.html`
- Botón Detener: `(click)="detener()"` (antes `detenerTodo()`)
- Leyenda: simplificada a "En tránsito" + "Almacén"
- Diálogo cancelación: 2 fases con `*ngIf="!cancelacionExitosa"` / `*ngIf="cancelacionExitosa"`
- `(onHide)="cerrarDialogoCancelacion()"` para reset al cerrar con X

### `simulacion.component.css`
```css
.btn-reprogramar { background: #2563eb; color: white; ... }  /* azul */
```

---

## Módulo: Monitoreo Mapa
**Ruta:** `pages/modules/monitoreo-mapa/`

### Lógica de planificación programada (K / Sa / Ta / Sc)

| Parámetro | Descripción |
|-----------|-------------|
| K  | Factor compresión temporal. Leído del back vía `/simulacion/monitoreo/config`. K=1 → 1s real = 1s simulado |
| Sa | Salto real (min): cada cuántos minutos reales se lanza el ALNS |
| Ta | Tiempo estimado ALNS (min reales). El frontend dispara la request con Ta min de antelación |
| Sc = K×Sa | Minutos de pedidos consumidos por ciclo |

**Todos estos parámetros son internos — el usuario NO los ve en la UI.**

### Auto-start (sin selector de fecha ni botón de inicio)
1. `ngOnInit` carga config + aeropuertos en paralelo
2. Al terminar ambas llama `GET /simulacion/monitoreo/fecha-inicio`
3. Usa la fecha devuelta como `ventanaActualInicio` y arranca el countdown SA minutos directamente

### Máquina de estados
```
cargando → iniciando (primer countdown) → procesando (primer ALNS) → animando → animando → ...
                                                                               → agotado (sin pedidos)
```
- `cargando`: spinner mientras carga aeropuertos + config → NO muestra mapa
- `iniciando`: primer countdown de SA minutos → NO muestra mapa (pantalla de carga con timer grande)
- `procesando`: primer ALNS corriendo → NO muestra mapa (pantalla de carga "calculando rutas")
- `animando`: mapa visible con aviones. Ciclos siguientes NO cambian estado (badge discreto en mapa)
- `agotado`: todos los pedidos procesados → mensaje de completado

**Countdown:** `Sa×60` segundos. A `Ta×60` segundos restantes dispara `POST /monitoreo/ejecutar`.  
**Delay:** 500 ms entre recepción de respuesta y actualización del mapa (retardo mínimo visible).  
**Ventana:** `ventanaActualInicio += Sc` cada ciclo.

### Animación de vuelos
- SVG overlay sobre el mapa (misma proyección equirectangular que módulo Simulación)
- Arcos Bézier cuadráticos con `stroke-dasharray` animado (CSS)
- Velocidad: `simTimeMs = animStartSim + realElapsed × K`  →  avanza K veces más rápido que el tiempo real
- Solo vuelos en tránsito: `horaSalidaMs <= simTimeMs < horaLlegadaMs`
- `aeropuertoSvgMap`: mapa OACI → `{x, y}` en coordenadas SVG, construido al cargar aeropuertos

### `simulacion-periodo.service.ts` (reescrito)
```typescript
getConfigMonitoreo()  → GET  /simulacion/monitoreo/config
ejecutarVentana(inicio, fin) → POST /simulacion/monitoreo/ejecutar?ventanaInicio=&ventanaFin=
// formato ISO: "2026-01-02T10:05:00"
```

### `mapa.component.ts` — estructura
- Mantiene toda la lógica existente de aeropuertos (CSS positioning, filtros, parseDMS)
- Agrega `aeropuertoSvgMap` para coordenadas SVG (distintas de las CSS%)
- `lonToX / latToY` igual que `simulacion.component.ts`
- Bezier: `ctrlPoint / calcArco / bezierPt / bezierTan` copiados del módulo Simulación
- `trackPlano` para `*ngFor` de `PlanoEnMapa` (tipo correcto, evita TS2322)

### `mapa.component.html` — estructura (rediseñado)
```
monitor-wrap (flex column, dark theme)
  [si cargando/iniciando/procesando]
    loading-screen:
      logo + brand
      countdown grande (estado iniciando)
      spinner + "calculando rutas" (estado procesando)
  [si animando/agotado]
    op-header: reloj simulado + stats rápidas + badge replanificación
    op-filters: continente + búsqueda
    op-content (grid 2 col):
      map-container:
        map-transform-layer (zoom/pan via CSS transform):
          img world.svg
          div.overlay
          svg.svg-overlay:
            círculos aeropuertos (g + circle + text) — estilo Simulación
            arcos EN_VUELO
            aviones (polygon body + wings) — idéntico a Simulación
        [fixed, no escalan con zoom]:
          leyenda
          stats-box con hora simulada
          zoom-controls (solo en fullscreen)
          fullscreen-btn
          replan-badge (background processing)
          tooltip avión
      sidebar: lista aeropuertos con capacidad
```

### Zoom / Pan / Fullscreen
- **Fullscreen:** `mapContainerEl.requestFullscreen()` → botón `pi-arrows-alt` top-left del mapa
- **Zoom:** botones +/−/⊙ visibles solo en fullscreen. Mouse wheel también funciona en fullscreen.
  `zoomLevel` 1–6, `transform: translate(panX, panY) scale(zoomLevel)` con `transform-origin:center`
- **Pan:** drag cuando `zoomLevel > 1`. `clampPan()` evita salirse del mapa.
- Al salir de fullscreen: `zoomLevel = 1, panX = 0, panY = 0` automáticamente.

### Aviones / Arcos — idénticos al módulo Simulación
- `polygon points="0,-22 8,6 0,-3 -8,6"` → cuerpo amarillo
- `polygon points="-20,0 20,0 13,8 -13,8"` → alas
- Arcos: `stroke:#38bdf8`, `stroke-dasharray:6 4`, animación `dash-move`
- Bezier cuadrático con punto de control perpendicular

### `mapa.component.css` — tema dark completo
Fondo `#0f172a`, acentos `#38bdf8`, aviones `#facc15`. Loading screen con countdown 3.5rem.

---

## Módulo: Planificación de Rutas
**Ruta:** `pages/modules/planificacion-rutas/components/rutas/rutas.component.html`

Líneas 167–207: `?.` → `.` en `aeropuertoOrigen` y `aeropuertoDestino`.  
El tipo TypeScript garantiza no-null → Angular 21 lanzaba warning NG8107.

---

## Notas transversales
- `prime-ng.module.ts`: **no modificado** (ya exporta `FormsModule`, `DatePickerModule`, etc.)
- `monitoreo-mapa.module.ts`: **no modificado** (ya importa `PrimeNgModule`)
- Los datos de pedidos para el Monitoreo Mapa deben estar en BD antes de usar el módulo (requiere haber ejecutado `importarVuelos` + `importarTodosEnvios` del módulo Simulación o equivalente)
