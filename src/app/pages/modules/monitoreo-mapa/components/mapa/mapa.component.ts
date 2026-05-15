import { ChangeDetectorRef, Component, NgZone, OnDestroy } from '@angular/core';
import { finalize, timeout } from 'rxjs/operators';
import {
  EventoSimulacionPeriodo,
  ResumenSimulacionPeriodo
} from '../../models/simulacion-periodo.model';
import { SimulacionPeriodoService } from '../../services/simulacion-periodo.service';

interface CoordenadaAeropuerto {
  codigo: string;
  nombre: string;
  ciudad: string;
  lat: number;
  lon: number;
}

interface AeropuertoVisual {
  codigo: string;
  nombre: string;
  ciudad: string;
  x: number;
  y: number;
}

interface RutaVisual {
  id: string;
  origen: string;
  destino: string;
  codigoVuelo: string;
  cantidad: number;
  path: string;
  duracion: number;
  delay: number;
}

@Component({
  selector: 'app-mapa',
  standalone: false,
  templateUrl: './mapa.component.html',
  styleUrl: './mapa.component.css',
})
export class MapaComponent implements OnDestroy {

  cargando = false;
  simulacionEjecutada = false;
  animandoVisual = false;
  mensajeError = '';

  resumen?: ResumenSimulacionPeriodo;
  resumenFinal?: ResumenSimulacionPeriodo;

  eventos: EventoSimulacionPeriodo[] = [];
  eventosBackend: EventoSimulacionPeriodo[] = [];

  aeropuertosMapa: AeropuertoVisual[] = [];
  rutasMapa: RutaVisual[] = [];

  indiceAnimacion = 0;
  private intervaloAnimacion: ReturnType<typeof setInterval> | null = null;

  private aeropuertosDinamicos: Record<string, CoordenadaAeropuerto> = {};

  private readonly aeropuertos: Record<string, CoordenadaAeropuerto> = {
    SBBR: { codigo: 'SBBR', nombre: 'Brasília Intl.', ciudad: 'Brasilia', lat: -15.87, lon: -47.92 },
    SBGR: { codigo: 'SBGR', nombre: 'São Paulo Guarulhos', ciudad: 'São Paulo', lat: -23.43, lon: -46.47 },
    SBGL: { codigo: 'SBGL', nombre: 'Rio de Janeiro Galeão', ciudad: 'Rio de Janeiro', lat: -22.81, lon: -43.25 },

    SAEZ: { codigo: 'SAEZ', nombre: 'Ezeiza Intl.', ciudad: 'Buenos Aires', lat: -34.82, lon: -58.54 },
    SABE: { codigo: 'SABE', nombre: 'Aeroparque Jorge Newbery', ciudad: 'Buenos Aires', lat: -34.56, lon: -58.42 },
    SCEL: { codigo: 'SCEL', nombre: 'Santiago Intl.', ciudad: 'Santiago', lat: -33.39, lon: -70.79 },
    SPJC: { codigo: 'SPJC', nombre: 'Jorge Chávez', ciudad: 'Lima', lat: -12.02, lon: -77.11 },
    SPIM: { codigo: 'SPIM', nombre: 'Jorge Chávez', ciudad: 'Lima', lat: -12.02, lon: -77.11 },
    SKBO: { codigo: 'SKBO', nombre: 'El Dorado', ciudad: 'Bogotá', lat: 4.70, lon: -74.15 },
    SEQM: { codigo: 'SEQM', nombre: 'Quito Intl.', ciudad: 'Quito', lat: -0.13, lon: -78.36 },
    SVMI: { codigo: 'SVMI', nombre: 'Simón Bolívar', ciudad: 'Caracas', lat: 10.60, lon: -66.99 },
    SLLP: { codigo: 'SLLP', nombre: 'El Alto', ciudad: 'La Paz', lat: -16.51, lon: -68.19 },
    SUAA: { codigo: 'SUAA', nombre: 'Ángel S. Adami', ciudad: 'Montevideo', lat: -34.79, lon: -56.26 },

    MMMX: { codigo: 'MMMX', nombre: 'Benito Juárez', ciudad: 'Ciudad de México', lat: 19.44, lon: -99.07 },
    KJFK: { codigo: 'KJFK', nombre: 'John F. Kennedy', ciudad: 'Nueva York', lat: 40.64, lon: -73.78 },
    KLAX: { codigo: 'KLAX', nombre: 'Los Angeles Intl.', ciudad: 'Los Ángeles', lat: 33.94, lon: -118.40 },
    KMIA: { codigo: 'KMIA', nombre: 'Miami Intl.', ciudad: 'Miami', lat: 25.79, lon: -80.29 },

    EHAM: { codigo: 'EHAM', nombre: 'Amsterdam Schiphol', ciudad: 'Ámsterdam', lat: 52.31, lon: 4.76 },
    EGLL: { codigo: 'EGLL', nombre: 'Heathrow', ciudad: 'Londres', lat: 51.47, lon: -0.45 },
    LFPG: { codigo: 'LFPG', nombre: 'Charles de Gaulle', ciudad: 'París', lat: 49.01, lon: 2.55 },
    LEMD: { codigo: 'LEMD', nombre: 'Madrid Barajas', ciudad: 'Madrid', lat: 40.47, lon: -3.56 },
    EDDF: { codigo: 'EDDF', nombre: 'Frankfurt Intl.', ciudad: 'Frankfurt', lat: 50.04, lon: 8.56 },
    LIRF: { codigo: 'LIRF', nombre: 'Roma Fiumicino', ciudad: 'Roma', lat: 41.80, lon: 12.25 },
    LOWW: { codigo: 'LOWW', nombre: 'Vienna Intl.', ciudad: 'Viena', lat: 48.11, lon: 16.57 },
    LSZH: { codigo: 'LSZH', nombre: 'Zurich Airport', ciudad: 'Zúrich', lat: 47.46, lon: 8.55 },
    EDDI: { codigo: 'EDDI', nombre: 'Berlin Tempelhof', ciudad: 'Berlín', lat: 52.47, lon: 13.40 },
    LKPR: { codigo: 'LKPR', nombre: 'Václav Havel', ciudad: 'Praga', lat: 50.10, lon: 14.26 },
    EBCI: { codigo: 'EBCI', nombre: 'Brussels South Charleroi', ciudad: 'Bruselas', lat: 50.46, lon: 4.45 },
    LDZA: { codigo: 'LDZA', nombre: 'Zagreb Airport', ciudad: 'Zagreb', lat: 45.74, lon: 16.07 },
    UMMS: { codigo: 'UMMS', nombre: 'Minsk National', ciudad: 'Minsk', lat: 53.88, lon: 28.03 },
    EKCH: { codigo: 'EKCH', nombre: 'Copenhagen Airport', ciudad: 'Copenhague', lat: 55.62, lon: 12.65 },
    LBSF: { codigo: 'LBSF', nombre: 'Sofia Airport', ciudad: 'Sofía', lat: 42.70, lon: 23.41 },
    LATI: { codigo: 'LATI', nombre: 'Tirana Airport', ciudad: 'Tirana', lat: 41.41, lon: 19.72 },

    RJTT: { codigo: 'RJTT', nombre: 'Tokyo Haneda', ciudad: 'Tokio', lat: 35.55, lon: 139.78 },
    ZBAA: { codigo: 'ZBAA', nombre: 'Beijing Capital', ciudad: 'Pekín', lat: 40.08, lon: 116.58 },
    ZSPD: { codigo: 'ZSPD', nombre: 'Shanghai Pudong', ciudad: 'Shanghái', lat: 31.14, lon: 121.80 },
    VHHH: { codigo: 'VHHH', nombre: 'Hong Kong Intl.', ciudad: 'Hong Kong', lat: 22.31, lon: 113.92 },
    WSSS: { codigo: 'WSSS', nombre: 'Singapore Changi', ciudad: 'Singapur', lat: 1.36, lon: 103.99 },
    VTBS: { codigo: 'VTBS', nombre: 'Bangkok Suvarnabhumi', ciudad: 'Bangkok', lat: 13.69, lon: 100.75 },
    VIDP: { codigo: 'VIDP', nombre: 'Delhi Intl.', ciudad: 'Delhi', lat: 28.56, lon: 77.10 },
    OMDB: { codigo: 'OMDB', nombre: 'Dubai Intl.', ciudad: 'Dubái', lat: 25.25, lon: 55.36 },
    RKSI: { codigo: 'RKSI', nombre: 'Incheon Intl.', ciudad: 'Seúl', lat: 37.46, lon: 126.44 },
    RPLL: { codigo: 'RPLL', nombre: 'Manila Intl.', ciudad: 'Manila', lat: 14.51, lon: 121.02 },

    OAKB: { codigo: 'OAKB', nombre: 'Kabul Intl.', ciudad: 'Kabul', lat: 34.57, lon: 69.21 },
    OJAI: { codigo: 'OJAI', nombre: 'Queen Alia Intl.', ciudad: 'Amán', lat: 31.72, lon: 35.99 },
    OOMS: { codigo: 'OOMS', nombre: 'Muscat Intl.', ciudad: 'Mascate', lat: 23.59, lon: 58.28 },
    OYSN: { codigo: 'OYSN', nombre: 'Sana’a Intl.', ciudad: 'Saná', lat: 15.48, lon: 44.22 },
    OERK: { codigo: 'OERK', nombre: 'King Khalid Intl.', ciudad: 'Riad', lat: 24.96, lon: 46.70 },
    OPKC: { codigo: 'OPKC', nombre: 'Jinnah Intl.', ciudad: 'Karachi', lat: 24.91, lon: 67.16 },
    OSDI: { codigo: 'OSDI', nombre: 'Damascus Intl.', ciudad: 'Damasco', lat: 33.41, lon: 36.52 },
  };

  constructor(
    private simulacionPeriodoService: SimulacionPeriodoService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) { }

  iniciarSimulacion5Dias(): void {
    if (this.cargando || this.animandoVisual) {
      return;
    }

    this.limpiarAnimacion();

    this.cargando = true;
    this.simulacionEjecutada = false;
    this.animandoVisual = false;
    this.mensajeError = '';

    this.resumen = undefined;
    this.resumenFinal = undefined;
    this.eventos = [];
    this.eventosBackend = [];
    this.aeropuertosMapa = [];
    this.rutasMapa = [];
    this.indiceAnimacion = 0;

    this.simulacionPeriodoService
      .ejecutarSimulacionPeriodo('2026-01-02', 5)
      .pipe(
        timeout(90000),
        finalize(() => {
          this.cargando = false;
        })
      )
      .subscribe({
        next: (response: any) => {
          console.log('Respuesta backend simulación:', response);

          this.limpiarAnimacion();

          const data = response?.data ?? {};
          const resumenBackend = data?.resumen;
          const eventosBackend = data?.eventos ?? [];

          this.resumenFinal = resumenBackend;
          this.eventosBackend = eventosBackend.filter(
            (evento: EventoSimulacionPeriodo) => evento.estado === 'ASIGNADO'
          );

          this.eventos = [...this.eventosBackend];
          this.aeropuertosMapa = [];
          this.rutasMapa = [];
          this.indiceAnimacion = 0;

          const codigosAeropuertos = new Set<string>();

          this.eventosBackend.forEach((evento) => {
            codigosAeropuertos.add(evento.origen);
            codigosAeropuertos.add(evento.destino);
          });

          codigosAeropuertos.forEach((codigo) => {
            this.agregarAeropuertoAlMapa(codigo);
          });

          this.rutasMapa = this.eventosBackend
            .map((evento, index) => this.crearRutaVisual(evento, index))
            .filter((ruta): ruta is RutaVisual => ruta !== null);

          this.resumen = this.resumenFinal;

          this.simulacionEjecutada = true;
          this.animandoVisual = false;
          this.cargando = false;

          this.forzarRepintadoMapa();

          console.log('Eventos asignados para pintar:', this.eventosBackend.length);
          console.log('Aeropuertos pintados:', this.aeropuertosMapa.length);
          console.log('Rutas pintadas:', this.rutasMapa.length);

          if (this.rutasMapa.length === 0) {
            this.mensajeError = 'La simulación respondió, pero no se pudieron pintar rutas en el mapa.';
          }
        },
        error: (error) => {
          this.limpiarAnimacion();

          console.error('Error al ejecutar simulación:', error);

          if (error.name === 'TimeoutError') {
            this.mensajeError = 'La simulación está demorando demasiado. Revisa si el backend terminó de responder.';
            return;
          }

          if (error.status === 0) {
            this.mensajeError = 'No hay conexión con el backend. Verifica que Spring Boot esté corriendo en http://localhost:3000/api.';
            return;
          }

          if (error.status === 401 || error.status === 403) {
            this.mensajeError = 'La solicitud fue bloqueada por autenticación. Revisa el AuthInterceptor.';
            return;
          }

          this.mensajeError = 'No se pudo ejecutar la simulación. Revisa la consola del backend o Swagger.';
        }
      });
  }

  private iniciarReproduccionVisual(): void {
    this.animandoVisual = true;
    this.indiceAnimacion = 0;

    this.intervaloAnimacion = setInterval(() => {
      if (this.indiceAnimacion >= this.eventosBackend.length) {
        this.finalizarReproduccionVisual();
        return;
      }

      const evento = this.eventosBackend[this.indiceAnimacion];

      this.eventos = [...this.eventos, evento];

      this.agregarAeropuertoAlMapa(evento.origen);
      this.agregarAeropuertoAlMapa(evento.destino);

      const ruta = this.crearRutaVisual(evento, this.indiceAnimacion);

      if (ruta) {
        this.rutasMapa = [...this.rutasMapa, ruta];
      }
      this.forzarRepintadoMapa();
      this.actualizarResumenVisual();

      this.indiceAnimacion++;
    }, 300);
  }

  private finalizarReproduccionVisual(): void {
    this.limpiarAnimacion();
    this.animandoVisual = false;

    if (this.resumenFinal) {
      this.resumen = this.resumenFinal;
    }
  }

  private limpiarAnimacion(): void {
    if (this.intervaloAnimacion) {
      clearInterval(this.intervaloAnimacion);
      this.intervaloAnimacion = null;
    }
  }

  private crearRutaVisual(evento: EventoSimulacionPeriodo, index: number): RutaVisual | null {
    const aeropuertoOrigen = this.obtenerAeropuerto(evento.origen);
    const aeropuertoDestino = this.obtenerAeropuerto(evento.destino);

    if (!aeropuertoOrigen || !aeropuertoDestino) {
      return null;
    }

    return {
      id: `ruta-${evento.idEnvio}-${index}`,
      origen: evento.origen,
      destino: evento.destino,
      codigoVuelo: evento.codigoVuelo || 'SIN-CODIGO',
      cantidad: evento.cantidad,
      path: this.generarPathRuta(evento.origen, evento.destino),
      duracion: 5 + (index % 5),
      delay: 0
    };
  }

  private agregarAeropuertoAlMapa(codigo: string): void {
    const aeropuerto = this.obtenerAeropuerto(codigo);

    if (!aeropuerto) {
      return;
    }

    const yaExiste = this.aeropuertosMapa.some(a => a.codigo === aeropuerto.codigo);

    if (yaExiste) {
      return;
    }

    const punto = this.proyectar(aeropuerto.lat, aeropuerto.lon);

    this.aeropuertosMapa = [
      ...this.aeropuertosMapa,
      {
        codigo: aeropuerto.codigo,
        nombre: aeropuerto.nombre,
        ciudad: aeropuerto.ciudad,
        x: punto.x,
        y: punto.y
      }
    ];
  }

  private obtenerAeropuerto(codigo: string): CoordenadaAeropuerto {
    const codigoNormalizado = (codigo || 'SIN-CODIGO').trim().toUpperCase();

    if (this.aeropuertos[codigoNormalizado]) {
      return this.aeropuertos[codigoNormalizado];
    }

    if (this.aeropuertosDinamicos[codigoNormalizado]) {
      return this.aeropuertosDinamicos[codigoNormalizado];
    }

    const aeropuertoFallback = this.crearAeropuertoFallback(codigoNormalizado);
    this.aeropuertosDinamicos[codigoNormalizado] = aeropuertoFallback;

    console.warn('Aeropuerto no estaba en el diccionario. Se creó coordenada temporal:', codigoNormalizado);

    return aeropuertoFallback;
  }

  private crearAeropuertoFallback(codigo: string): CoordenadaAeropuerto {
    const hash = this.hashCodigo(codigo);
    const ajusteLat = ((hash % 20) - 10) * 0.7;
    const ajusteLon = (((hash / 20) % 20) - 10) * 0.9;

    let lat = 0;
    let lon = 0;

    if (codigo.startsWith('S') || codigo.startsWith('M') || codigo.startsWith('K')) {
      lat = -10 + ajusteLat;
      lon = -65 + ajusteLon;
    } else if (codigo.startsWith('E') || codigo.startsWith('L') || codigo.startsWith('U')) {
      lat = 48 + ajusteLat;
      lon = 15 + ajusteLon;
    } else {
      lat = 25 + ajusteLat;
      lon = 65 + ajusteLon;
    }

    return {
      codigo,
      nombre: codigo,
      ciudad: codigo,
      lat,
      lon
    };
  }

  private hashCodigo(codigo: string): number {
    return codigo
      .split('')
      .reduce((total, caracter) => total + caracter.charCodeAt(0), 0);
  }

  private actualizarResumenVisual(): void {
    if (!this.resumenFinal) {
      return;
    }

    const enviosAsignados = this.eventos.filter(evento => evento.estado === 'ASIGNADO').length;
    const enviosNoAsignados = this.eventos.filter(evento => evento.estado !== 'ASIGNADO').length;

    const maletasAsignadas = this.eventos
      .filter(evento => evento.estado === 'ASIGNADO')
      .reduce((total, evento) => total + evento.cantidad, 0);

    const maletasNoAsignadas = this.eventos
      .filter(evento => evento.estado !== 'ASIGNADO')
      .reduce((total, evento) => total + evento.cantidad, 0);

    const vuelosUtilizados = new Set(
      this.eventos
        .filter(evento => evento.estado === 'ASIGNADO' && evento.codigoVuelo)
        .map(evento => evento.codigoVuelo)
    ).size;

    this.resumen = {
      ...this.resumenFinal,
      enviosAsignados,
      enviosNoAsignados,
      maletasAsignadas,
      maletasNoAsignadas,
      vuelosUtilizados
    };
  }

  private generarPathRuta(origen: string, destino: string): string {
    const aeropuertoOrigen = this.obtenerAeropuerto(origen);
    const aeropuertoDestino = this.obtenerAeropuerto(destino);

    const inicio = this.proyectar(aeropuertoOrigen.lat, aeropuertoOrigen.lon);
    const fin = this.proyectar(aeropuertoDestino.lat, aeropuertoDestino.lon);

    const medioX = (inicio.x + fin.x) / 2;
    const medioY = (inicio.y + fin.y) / 2;

    const distancia = Math.abs(fin.x - inicio.x);
    const curva = Math.min(14, Math.max(5, distancia * 0.18));

    return `M ${inicio.x} ${inicio.y} Q ${medioX} ${medioY - curva} ${fin.x} ${fin.y}`;
  }

  private proyectar(lat: number, lon: number): { x: number; y: number } {
    const x = ((lon + 180) / 360) * 100;
    const y = ((90 - lat) / 180) * 100;

    return { x, y };
  }

  get porcentajeEnviosAsignados(): number {
    if (!this.resumen || this.resumen.totalEnvios === 0) {
      return 0;
    }

    return Math.round((this.resumen.enviosAsignados / this.resumen.totalEnvios) * 100);
  }

  get porcentajeMaletasAsignadas(): number {
    if (!this.resumen || this.resumen.totalMaletas === 0) {
      return 0;
    }

    return Math.round((this.resumen.maletasAsignadas / this.resumen.totalMaletas) * 100);
  }

  private forzarRepintadoMapa(): void {
    this.ngZone.run(() => {
      this.aeropuertosMapa = [...this.aeropuertosMapa];
      this.rutasMapa = [...this.rutasMapa];
      this.eventos = [...this.eventos];

      this.cdr.detectChanges();

      setTimeout(() => {
        this.cdr.detectChanges();
        window.dispatchEvent(new Event('resize'));
      }, 0);

      requestAnimationFrame(() => {
        this.cdr.detectChanges();
        window.dispatchEvent(new Event('resize'));
      });
    });
  }

  ngOnDestroy(): void {
    this.limpiarAnimacion();
  }
}