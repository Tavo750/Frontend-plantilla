import { Injectable } from '@angular/core';

/**
 * Conserva la sesión de reproducción del módulo Simulación entre navegaciones.
 *
 * El módulo Simulación corre client-side (SSE + reproducción). Para que NO se
 * reinicie al cambiar de pestaña, al salir se guarda aquí un snapshot completo
 * (datos + reloj de reproducción) y al volver se restaura. Como se guarda el
 * instante real del guardado, al regresar el reloj se adelanta por el tiempo
 * que el usuario estuvo fuera, dando la sensación de que "siguió avanzando".
 */
@Injectable({ providedIn: 'root' })
export class SimulacionSesionService {

  private mem: any = null;

  /** Guarda el snapshot (sella el instante real para poder adelantar al volver). */
  guardar(snapshot: any): void {
    this.mem = { ...snapshot, guardadoEnMs: Date.now() };
  }

  obtener(): any { return this.mem; }

  get tieneSesion(): boolean { return !!this.mem; }

  limpiar(): void { this.mem = null; }
}
