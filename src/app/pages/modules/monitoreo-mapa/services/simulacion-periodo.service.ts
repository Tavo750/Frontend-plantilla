import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../../../environment/environment';

/**
 * Servicio singleton (providedIn: 'root') que actúa como memoria global
 * del módulo Monitoreo Mapa entre navegaciones.
 *
 * Como el componente MapaComponent se destruye/recrea cada vez que el usuario
 * navega, toda la información que debe persistir entre visitas se guarda aquí.
 *
 * Garantías:
 *  - El POST /ejecutar se envía UNA SOLA VEZ en toda la vida de la app.
 *  - La pantalla de carga/countdown aparece UNA SOLA VEZ.
 *  - En visitas posteriores, el mapa se restaura directamente desde el caché.
 */
@Injectable({
  providedIn: 'root'
})
export class SimulacionPeriodoService {

  private readonly baseMonitoreo = `${environment.apiUrl}simulacion/monitoreo`;

  // ── Estado global persistente ────────────────────────────────
  /** true después de que se envió el primer POST /ejecutar */
  private _monitoreoIniciado = false;
  /** true después de que el primer resultado se mostró en el mapa */
  private _primerResultadoMostrado = false;
  /** Último resultado recibido del backend (vuelos, asignados, etc.) */
  private _ultimoResultado: any = null;
  /** Ciclo cuyo resultado está en caché */
  private _ultimoCiclo = 0;

  get monitoreoIniciado(): boolean            { return this._monitoreoIniciado; }
  get primerResultadoMostrado(): boolean      { return this._primerResultadoMostrado; }
  get ultimoResultadoCacheado(): any          { return this._ultimoResultado; }
  get ultimoCicloCacheado(): number           { return this._ultimoCiclo; }

  /** Llamar una única vez cuando se envía el POST /ejecutar */
  marcarIniciado(): void { this._monitoreoIniciado = true; }

  /** Llamar cuando el primer resultado se aplica al mapa */
  marcarResultadoMostrado(resultado: any, ciclo: number): void {
    this._primerResultadoMostrado = true;
    this._ultimoResultado = resultado;
    this._ultimoCiclo     = ciclo;
  }

  /** Actualizar caché cuando llega un resultado de un ciclo posterior */
  actualizarResultadoCacheado(resultado: any, ciclo: number): void {
    this._ultimoResultado = resultado;
    this._ultimoCiclo     = ciclo;
  }

  // ── HTTP ─────────────────────────────────────────────────────

  constructor(private readonly http: HttpClient) {}

  getConfigMonitoreo(): Observable<any> {
    return this.http.get<any>(`${this.baseMonitoreo}/config`);
  }

  getFechaInicio(): Observable<any> {
    return this.http.get<any>(`${this.baseMonitoreo}/fecha-inicio`);
  }

  getEstado(): Observable<any> {
    return this.http.get<any>(`${this.baseMonitoreo}/estado`);
  }

  iniciarMonitoreo(ventanaInicio?: string): Observable<any> {
    const params = ventanaInicio
      ? new HttpParams().set('ventanaInicio', ventanaInicio)
      : new HttpParams();
    return this.http.post<any>(`${this.baseMonitoreo}/ejecutar`, null, { params });
  }
}
