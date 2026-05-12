import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { MenuService, MenuItem } from '../../services/menu.service';
import { AuthService } from '../../services/auth.service';
import { Usuario } from '../../interfaces/usuario.interface';
import { getInitials } from '../../helpers/utils.helper';
import * as global from '../../../global';

/**
 * Componente Header.
 * Principio SOLID (S): Solo maneja la barra superior (breadcrumb, perfil).
 * Principio SOLID (D): Depende de abstracciones (MenuService, AuthService).
 */
@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent implements OnInit, OnDestroy {
  @Input() usuario: Usuario | null = null;

  breadcrumbItems: { label: string; routerLink?: string | string[] }[] = [];
  home = { icon: 'pi pi-home', routerLink: '/inicio/inicio' };

  showProfileMenu = false;
  public global = global;

  private routerSubscription!: Subscription;

  constructor(
    private readonly router: Router,
    private readonly menuService: MenuService,
    private readonly authService: AuthService
  ) {}

  ngOnInit(): void {
    // Cargar usuario si no viene por Input
    if (!this.usuario) {
      this.usuario = this.authService.getCurrentUser();
    }

    // Procesar URL actual
    this.findLabelForUrl(this.router.url);

    // Suscribirse a cambios de ruta
    this.routerSubscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.findLabelForUrl(event.urlAfterRedirects);
      });
  }

  ngOnDestroy(): void {
    this.routerSubscription?.unsubscribe();
  }

  get avatarLabel(): string {
    return getInitials(this.usuario?.nombreCompleto || '');
  }

  toggleProfileMenu(): void {
    this.showProfileMenu = !this.showProfileMenu;
  }

  closeProfileMenu(): void {
    this.showProfileMenu = false;
  }

  onLogout(): void {
    this.authService.logout().subscribe(() => {
      window.location.href = global.urlAuth;
    });
    this.closeProfileMenu();
  }

  // ========== BREADCRUMB ==========

  private findLabelForUrl(url: string): void {
    this.menuService.getMenuItems$().subscribe({
      next: (items) => {
        this.processMenuForBreadcrumb(items, url);
      }
    });
  }

  private processMenuForBreadcrumb(items: MenuItem[], url: string): void {
    const path = this.normalizePath(url);
    const labelPath: string[] = [];
    const routerLinkPath: any[] = [];

    const findPath = (
      menuItems: MenuItem[],
      parentLabels: string[] = [],
      parentRouterLinks: any[] = []
    ): boolean => {
      for (const item of menuItems) {
        const fullPath = this.normalizeRouterLink(item.routerLink);
        const currentLabels = [...parentLabels, item.label ?? ''];
        const currentRouterLinks = [...parentRouterLinks, item.routerLink ?? ''];

        if (fullPath && path.startsWith(fullPath)) {
          labelPath.splice(0, labelPath.length, ...currentLabels);
          routerLinkPath.splice(0, routerLinkPath.length, ...currentRouterLinks);
          return true;
        }

        if (item.items && findPath(item.items, currentLabels, currentRouterLinks)) {
          return true;
        }
      }
      return false;
    };

    if (findPath(items)) {
      this.breadcrumbItems = labelPath.map((label, index) => ({
        label,
        routerLink: index < routerLinkPath.length && index < labelPath.length - 1
          ? routerLinkPath[index]
          : undefined
      }));
    } else {
      this.breadcrumbItems = [];
    }
  }

  private normalizePath(url: string): string {
    return url.replace(/^\/+|\/+$/g, '').toLowerCase();
  }

  private normalizeRouterLink(routerLink: string | string[] | undefined): string {
    if (!routerLink) return '';
    if (typeof routerLink === 'string') return routerLink.replace(/^\/+|\/+$/g, '').toLowerCase();
    if (Array.isArray(routerLink)) return routerLink.join('/').replace(/^\/+|\/+$/g, '').toLowerCase();
    return '';
  }
}
