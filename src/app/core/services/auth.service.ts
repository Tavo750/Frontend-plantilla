import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { Usuario } from '../interfaces/usuario.interface';

/**
 * Servicio de autenticación.
 * Principio SOLID (S): Responsabilidad única - gestionar autenticación.
 * Principio SOLID (D): Se inyecta como dependencia, invertible.
 */
@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly TOKEN_KEY = 'auth_token';
  private readonly isAuthenticatedSubject = new BehaviorSubject<boolean>(this.hasToken());
  private readonly currentUserSubject = new BehaviorSubject<Usuario | null>(null);

  readonly isAuthenticated$ = this.isAuthenticatedSubject.asObservable();
  readonly currentUser$ = this.currentUserSubject.asObservable();

  constructor() {
    // Simular usuario autenticado para la plantilla
    this.initMockUser();
  }

  /**
   * Inicializa un usuario mock para demostración.
   * En producción, esto se reemplazaría por una llamada HTTP.
   */
  private initMockUser(): void {
    const mockUser: Usuario = {
      id: 1,
      nombre: 'Usuario',
      apellidoPaterno: 'Demo',
      nombreCompleto: 'Usuario Demo',
      correo: 'usuario@demo.com',
      puesto: 'Desarrollador',
      estado: true
    };
    this.currentUserSubject.next(mockUser);
    this.isAuthenticatedSubject.next(true);
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  isAuthenticated(): boolean {
    return this.isAuthenticatedSubject.value;
  }

  getCurrentUser(): Usuario | null {
    return this.currentUserSubject.value;
  }

  login(token: string, user: Usuario): void {
    localStorage.setItem(this.TOKEN_KEY, token);
    this.currentUserSubject.next(user);
    this.isAuthenticatedSubject.next(true);
  }

  logout(): Observable<void> {
    localStorage.removeItem(this.TOKEN_KEY);
    this.currentUserSubject.next(null);
    this.isAuthenticatedSubject.next(false);
    return of(void 0);
  }

  private hasToken(): boolean {
    return !!localStorage.getItem(this.TOKEN_KEY);
  }
}
