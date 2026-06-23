import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { AuthService } from '../../pages/full-pages/auth/services/auth.service';

/**
 * Guard de autenticación.
 * Principio SOLID (S): Solo verifica si el usuario está autenticado.
 * Principio SOLID (D): Depende de la abstracción AuthService.
 */
@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router
  ) {}

  canActivate(): boolean | UrlTree {
    if (this.authService.isAuthenticated()) {
      return true;
    }
    // Redirigir al login si no está autenticado
    return this.router.createUrlTree(['/auth/login']);
  }
}
