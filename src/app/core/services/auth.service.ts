import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { Usuario } from '../interfaces/usuario.interface';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly TOKEN_KEY = 'auth_token';
  private readonly isAuthenticatedSubject = new BehaviorSubject<boolean>(this.hasToken());
  private readonly currentUserSubject = new BehaviorSubject<Usuario | null>(this.getUserFromStorage());

  readonly isAuthenticated$ = this.isAuthenticatedSubject.asObservable();
  readonly currentUser$ = this.currentUserSubject.asObservable();

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
    localStorage.setItem('current_user', JSON.stringify(user));
    this.currentUserSubject.next(user);
    this.isAuthenticatedSubject.next(true);
  }

  logout(): Observable<void> {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem('current_user');
    this.currentUserSubject.next(null);
    this.isAuthenticatedSubject.next(false);
    return of(void 0);
  }

  private hasToken(): boolean {
    return true; // !!localStorage.getItem(this.TOKEN_KEY);
  }

  private getUserFromStorage(): Usuario | null {
    const raw = localStorage.getItem('current_user');
    return raw ? JSON.parse(raw) : {
      id: 1,
      nombre: 'Admin',
      apellidoPaterno: 'Usuario',
      nombreCompleto: 'Admin Usuario',
      correo: 'admin@sistema.com',
      estado: true,
      idAeropuerto: 1,
      codigoOaciAeropuerto: 'SPJC',
      ciudadAeropuerto: 'Lima'
    };
  }
}
