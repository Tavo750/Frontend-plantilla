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
      id: 4,
      nombre: 'Flavio',
      apellidoPaterno: 'Ascamar',
      nombreCompleto: 'Flavio Ascamar Garcia',
      correo: 'flavioascamar@gmail.com',
      puesto: 'Administrador',
      estado: true,
      idAeropuerto: 5,
      codigoOaciAeropuerto: 'SPIM',
      ciudadAeropuerto: 'Lima'
    };
    const token = 'eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJmbGF2aW9hc2NhbWFyQGdtYWlsLmNvbSIsImlhdCI6MTc4MTgxNTAzNSwiZXhwIjoxNzgxOTAxNDM1fQ.5gMi9dG_MxWlr1UWER2lKzlwBJ6qLXsui2fKuqXkIVr5NwO8lvS9Ma-sK3tuIdM_WjRCRgFIzivoFfQJoC4SNA';
    localStorage.setItem(this.TOKEN_KEY, token);
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
