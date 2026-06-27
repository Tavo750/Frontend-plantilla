import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { AuthService } from '../../pages/full-pages/auth/services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router
  ) {}

  canActivate(): boolean | UrlTree {
    const token = this.authService.getToken();

    if (!token) {
      return this.router.createUrlTree(['/auth/login']);
    }

    if (this.isTokenExpired(token)) {
      this.authService.logout().subscribe();
      return this.router.createUrlTree(['/auth/login']);
    }

    return true;
  }

  private isTokenExpired(token: string): boolean {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp * 1000 < Date.now();
    } catch {
      return true;
    }
  }
}
