import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Página de inicio.
 */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent {
  cards = [
    {
      title: 'Dashboard',
      description: 'Visualiza métricas clave del sistema en tiempo real.',
      icon: 'pi pi-chart-bar',
      color: '#4a7aff'
    },
    {
      title: 'Usuarios',
      description: 'Gestiona los usuarios y sus permisos de acceso.',
      icon: 'pi pi-users',
      color: '#6dd5a1'
    },
    {
      title: 'Reportes',
      description: 'Genera y descarga reportes personalizados.',
      icon: 'pi pi-file',
      color: '#f59e0b'
    },
    {
      title: 'Configuración',
      description: 'Ajusta los parámetros generales del sistema.',
      icon: 'pi pi-cog',
      color: '#8b5cf6'
    }
  ];
}
