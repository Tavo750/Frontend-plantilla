import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, of } from 'rxjs';
import { tap } from 'rxjs/operators';

import { environment } from '../../../../../environment/environment';
import { CacheService } from '../../../../core/services/cache.service';

/**
 * Servicio singleton del Monitoreo Mapa.
 *
 * El RELOJ de simulación es autoritativo en el backend: este servicio solo
 * recibe sus mensajes por WebSocket y cachea el último snapshot en memoria
 * para que, al volver al módulo, el mapa retome el estado sin reiniciar.
 *
 * Tipos de mensaje WS:
 *  - TICK  → reloj + contadores (liviano, ~1/seg)
 *  - PLAN  → snapshot completo con la lista de vuelos acumulada
 *  - SNAPSHOT → igual que PLAN, devuelto por GET /estado al entrar
 */
@Injectable({ providedIn: 'root' })
export class SimulacionPeriodoService implements OnDestroy {

  private readonly baseMonitoreo = `${environment.apiUrl}simulacion/monitoreo`;

  // ── Estado global persistente (sobrevive a la navegación) ─────
  private _arrancado = false;
  /** Último snapshot conocido (vuelos + paneles + contadores + reloj). */
  private _estado: any = null;

  get arrancado(): boolean { return this._arrancado; }
  get estadoCacheado(): any { return this._estado; }

  marcarArrancado(): void { this._arrancado = true; }

  /** Guarda/mezcla el último estado recibido para bootstrap al re-entrar. */
  guardarEstado(data: any): void {
    if (!data) return;
    if (data.tipo === 'TICK') {
      // Solo actualizar reloj/contadores sobre el estado previo
      this._estado = { ...(this._estado ?? {}), ...data };
    } else {
      // PLAN o SNAPSHOT: estado completo
      this._estado = data;
    }
  }

  // ── WebSocket ────────────────────────────────────────────────
  private ws: WebSocket | null = null;
  private reconectarTimer: any = null;
  private desconectando = false;

  private readonly _estadoWs$ = new Subject<any>();
  /** Stream de mensajes del backend vía WebSocket. */
  readonly estadoWs$ = this._estadoWs$.asObservable();

  private get wsUrl(): string {
    const api = environment.apiUrl.replace(/\/$/, ''); // quitar trailing slash
    // URL relativa (producción): derivar host desde window.location
    if (!api.startsWith('http')) {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${window.location.host}${api}/ws/monitoreo`;
    }
    // URL absoluta (desarrollo): dev → ws://localhost:3000/api/ws/monitoreo
    return api
      .replace('https://', 'wss://')
      .replace('http://',  'ws://')
      + '/ws/monitoreo';
  }

  conectarWs(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.desconectando = false;
    this._abrirConexion();
  }

  desconectarWs(): void {
    this.desconectando = true;
    if (this.reconectarTimer) { clearTimeout(this.reconectarTimer); this.reconectarTimer = null; }
    this.ws?.close();
    this.ws = null;
  }

  private _abrirConexion(): void {
    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.guardarEstado(data);
          this._estadoWs$.next(data);
        } catch { /* mensaje no JSON — ignorar */ }
      };

      this.ws.onclose = () => {
        if (!this.desconectando) {
          // Reconexión automática con back-off de 5s
          this.reconectarTimer = setTimeout(() => this._abrirConexion(), 5000);
        }
      };

      this.ws.onerror = () => { this.ws?.close(); };
    } catch {
      if (!this.desconectando) {
        this.reconectarTimer = setTimeout(() => this._abrirConexion(), 5000);
      }
    }
  }

  // ── HTTP ─────────────────────────────────────────────────────

  constructor(
    private readonly http: HttpClient,
    private readonly cache: CacheService
  ) {}

  ngOnDestroy(): void { this.desconectarWs(); }

  /**
   * Config K/SA con caché en localStorage.
   * Seguro de cachear: los mensajes WS también traen K/SA actualizados.
   */
  getConfigMonitoreo(): Observable<any> {
    const cached = this.cache.get<any>('dp1_cache_config_monitoreo');
    if (cached) return of(cached);
    return this.http.get<any>(`${this.baseMonitoreo}/config`).pipe(
      tap(resp => { if (resp?.data) this.cache.set('dp1_cache_config_monitoreo', resp); })
    );
  }

  /** Snapshot completo (reloj + vuelos acumulados + paneles) para bootstrap al entrar. */
  getEstado(): Observable<any> {
    return this.http.get<any>(`${this.baseMonitoreo}/estado`);
  }

  /** Arranca la simulación server-side (idempotente). Devuelve el snapshot actual. */
  iniciarMonitoreo(): Observable<any> {
    return this.http.post<any>(`${this.baseMonitoreo}/ejecutar`, null);
  }
}
