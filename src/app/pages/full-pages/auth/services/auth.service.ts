import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { Router } from '@angular/router';
import { Usuario } from '../../../../core/interfaces/usuario.interface';
import { LoginBody } from '../interfaces/loginBody';
import { LoginResponse } from '../interfaces/loginResponse';
import { RegisterBody } from '../interfaces/registerBody';
import { RegisterResponse } from '../interfaces/registerResponse';
import { environment } from '../../../../../environment/environment';

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
  private readonly LOGIN_URL    = `${environment.apiUrl}auth/login`;
  private readonly REGISTER_URL = `${environment.apiUrl}auth/register`;

  private readonly isAuthenticatedSubject = new BehaviorSubject<boolean>(this.hasToken());
  private readonly currentUserSubject = new BehaviorSubject<Usuario | null>(this.getUserFromStorage());

  readonly isAuthenticated$ = this.isAuthenticatedSubject.asObservable();
  readonly currentUser$ = this.currentUserSubject.asObservable();

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router
  ) {}

  /**
   * Realiza el login contra el endpoint /api/auth/login.
   * Almacena el JWT y los datos del usuario en localStorage.
   */
  login(body: LoginBody): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(this.LOGIN_URL, body).pipe(
      tap((response: LoginResponse) => {
        const { token, tipo, ...userData } = response.data;

        // Guardar solo el token JWT puro (sin prefijo); el interceptor agrega "Bearer "
        localStorage.setItem(this.TOKEN_KEY, token);

        // Mapear datos del usuario incluyendo aeropuerto asignado
        const user: Usuario = {
          id:                    userData.id,
          nombre:                userData.nombre,
          apellidoPaterno:       userData.apellidoPaterno,
          nombreCompleto:        userData.nombreCompleto,
          correo:                userData.correo,
          puesto:                userData.puesto,
          estado:                userData.estado,
          idAeropuerto:          userData.idAeropuerto,
          codigoOaciAeropuerto:  userData.codigoOaciAeropuerto,
          ciudadAeropuerto:      userData.ciudadAeropuerto
        };

        localStorage.setItem('current_user', JSON.stringify(user));
        this.currentUserSubject.next(user);
        this.isAuthenticatedSubject.next(true);
      })
    );
  }

  /**
   * Registra un nuevo usuario contra el endpoint /api/auth/register.
   * Almacena el JWT y los datos del usuario en localStorage.
   */
  register(body: RegisterBody): Observable<RegisterResponse> {
    return this.http.post<RegisterResponse>(this.REGISTER_URL, body).pipe(
      tap((response: RegisterResponse) => {
        const { token, tipo, ...userData } = response.data;

        // Guardar solo el token JWT puro (sin prefijo); el interceptor agrega "Bearer "
        localStorage.setItem(this.TOKEN_KEY, token);

        // Mapear datos del usuario incluyendo aeropuerto asignado (puede ser null en registro)
        const user: Usuario = {
          id:                    userData.id,
          nombre:                userData.nombre,
          apellidoPaterno:       userData.apellidoPaterno,
          nombreCompleto:        userData.nombreCompleto,
          correo:                userData.correo,
          puesto:                userData.puesto,
          estado:                userData.estado,
          idAeropuerto:          userData.idAeropuerto,
          codigoOaciAeropuerto:  userData.codigoOaciAeropuerto,
          ciudadAeropuerto:      userData.ciudadAeropuerto
        };

        localStorage.setItem('current_user', JSON.stringify(user));
        this.currentUserSubject.next(user);
        this.isAuthenticatedSubject.next(true);
      })
    );
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

  logout(): Observable<void> {
    return new Observable<void>(observer => {
      localStorage.removeItem(this.TOKEN_KEY);
      localStorage.removeItem('current_user');
      this.currentUserSubject.next(null);
      this.isAuthenticatedSubject.next(false);
      observer.next();
      observer.complete();
    });
  }

  private hasToken(): boolean {
    return !!localStorage.getItem(this.TOKEN_KEY);
  }

  private getUserFromStorage(): Usuario | null {
    const raw = localStorage.getItem('current_user');
    return raw ? JSON.parse(raw) : null;
  }
}
