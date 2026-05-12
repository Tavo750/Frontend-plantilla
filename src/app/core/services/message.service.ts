import { Injectable } from '@angular/core';

/**
 * Tipos de notificación del sistema.
 */
export type MessageSeverity = 'success' | 'info' | 'warn' | 'error';

/**
 * Interfaz de mensaje.
 */
export interface AppMessage {
  severity: MessageSeverity;
  summary: string;
  detail: string;
  life?: number;
}

/**
 * Servicio de mensajes/notificaciones.
 * Principio SOLID (S): Solo maneja notificaciones al usuario.
 * Este es un wrapper que se puede extender para usar PrimeNG MessageService
 * o cualquier otra librería de toasts.
 */
@Injectable({
  providedIn: 'root'
})
export class MessageAppService {

  success(summary: string, detail: string = ''): void {
    this.showMessage({ severity: 'success', summary, detail });
  }

  info(summary: string, detail: string = ''): void {
    this.showMessage({ severity: 'info', summary, detail });
  }

  warn(summary: string, detail: string = ''): void {
    this.showMessage({ severity: 'warn', summary, detail });
  }

  error(summary: string, detail: string = ''): void {
    this.showMessage({ severity: 'error', summary, detail });
  }

  private showMessage(message: AppMessage): void {
    // En producción, conectar con PrimeNG MessageService
    console.log(`[${message.severity.toUpperCase()}] ${message.summary}: ${message.detail}`);
  }
}
