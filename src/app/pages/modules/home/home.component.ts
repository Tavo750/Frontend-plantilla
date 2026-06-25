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
      title: 'Operación diaria',
      description: 'Monitorea el estado en tiempo real del sistema de transporte.',
      icon: 'pi pi-map',
      color: '#4a7aff'
    },
    {
      title: 'Simulación',
      description: 'Ejecuta simulaciones de escenarios operativos y de colapso.',
      icon: 'pi pi-play-circle',
      color: '#6dd5a1'
    },
    {
      title: 'Gestión de Vuelos',
      description: 'Administra el catálogo de vuelos y sus horarios.',
      icon: 'pi pi-send',
      color: '#f59e0b'
    },
    {
      title: 'Gestión de Aeropuertos',
      description: 'Configura aeropuertos, capacidades y parámetros.',
      icon: 'pi pi-building',
      color: '#8b5cf6'
    }
  ];
}
