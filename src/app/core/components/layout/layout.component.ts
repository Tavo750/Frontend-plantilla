import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HeaderComponent } from '../header/header.component';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { FooterComponent } from '../footer/footer.component';
import { AuthService } from '../../services/auth.service';
import { Usuario } from '../../interfaces/usuario.interface';

/**
 * Componente Layout principal.
 * Principio SOLID (S): Solo gestiona la estructura visual (sidebar + header + content + footer).
 * Principio SOLID (O): Extensible - el contenido se inyecta vía <router-outlet>.
 */
@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    HeaderComponent,
    SidebarComponent,
    FooterComponent
  ],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css'
})
export class LayoutComponent {
  isSidebarOpen = true;
  isSidebarOpenMobile = false;
  isMobile = false;
  usuario: Usuario | null = null;

  constructor(private readonly authService: AuthService) {}

  ngOnInit(): void {
    // Obtener usuario actual
    this.usuario = this.authService.getCurrentUser();

    // Detectar tamaño de pantalla inicial
    const windowWidth = window.innerWidth;
    if (windowWidth < 768) {
      this.isSidebarOpen = false;
      this.isSidebarOpenMobile = false;
      this.isMobile = true;
    } else {
      this.isSidebarOpen = true;
      this.isSidebarOpenMobile = false;
      this.isMobile = false;
    }
  }

  toggleSidebar(): void {
    if (window.innerWidth < 768) {
      this.isSidebarOpenMobile = !this.isSidebarOpenMobile;
    } else {
      this.isSidebarOpen = !this.isSidebarOpen;
    }
  }

  closeMobileSidebar(): void {
    this.isSidebarOpenMobile = false;
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: any): void {
    if (event.target.innerWidth >= 768) {
      this.isSidebarOpen = true;
      this.isSidebarOpenMobile = false;
      this.isMobile = false;
    } else {
      this.isSidebarOpen = false;
      this.isMobile = true;
    }
  }
}
