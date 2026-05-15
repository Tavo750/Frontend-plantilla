import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-mapa',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './mapa.component.html',
  styleUrls: ['./mapa.component.css']
})
export class MapaComponent {

  autoRefresh = false;

  selectedContinent = 'all';

  worldMapUrl =
    'https://images.unsplash.com/photo-1742415105376-43d3a5fd03fc?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080';

  flights = [1, 2, 3, 4];

  filteredAirports = [
    {
      code: 'JFK',
      city: 'New York',
      country: 'USA',
      continent: 'America',
      x: 22,
      y: 35,
      storage: 74,
      active: true
    },
    {
      code: 'LHR',
      city: 'Londres',
      country: 'UK',
      continent: 'Europe',
      x: 48,
      y: 25,
      storage: 52,
      active: false
    },
    {
      code: 'LIM',
      city: 'Lima',
      country: 'Perú',
      continent: 'America',
      x: 28,
      y: 58,
      storage: 65,
      active: true
    }
  ];

  activeLuggage = [
    {
      id: 'BG-001',
      status: 'En tránsito',
      current: 'JFK - New York',
      destination: 'LHR - Londres',
      airline: 'AA',
      quantity: 24
    },
    {
      id: 'BG-002',
      status: 'Registrado',
      current: 'LIM - Lima',
      destination: 'MAD - Madrid',
      airline: 'IB',
      quantity: 12
    }
  ];

  toggleRefresh() {
    this.autoRefresh = !this.autoRefresh;
  }

}