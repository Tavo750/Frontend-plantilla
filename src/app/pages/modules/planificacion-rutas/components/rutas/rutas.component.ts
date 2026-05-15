import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Airport {
  id: string;
  code: string;
  city: string;
  country: string;
  continent: string;
}

interface Flight {
  id: string;
  originId: string;
  destinationId: string;
  capacity: number;
  currentLoad: number;
  nextDeparture: string;
}

interface Luggage {
  id: string;
  originId: string;
  destinationId: string;
  quantity: number;
}

@Component({
  selector: 'app-rutas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './rutas.component.html',
  styleUrls: ['./rutas.component.css']
})
export class RutasComponent {

  selectedLuggage = '';

  routes: any[] = [];

  airports: Airport[] = [
    {
      id: 'jfk',
      code: 'JFK',
      city: 'New York',
      country: 'USA',
      continent: 'America'
    },
    {
      id: 'lhr',
      code: 'LHR',
      city: 'Londres',
      country: 'UK',
      continent: 'Europe'
    },
    {
      id: 'lim',
      code: 'LIM',
      city: 'Lima',
      country: 'Perú',
      continent: 'America'
    }
  ];

  luggageData: Luggage[] = [
    {
      id: 'BG-001',
      originId: 'jfk',
      destinationId: 'lhr',
      quantity: 24
    },
    {
      id: 'BG-002',
      originId: 'lim',
      destinationId: 'lhr',
      quantity: 10
    }
  ];

  flights: Flight[] = [
    {
      id: 'FL-101',
      originId: 'jfk',
      destinationId: 'lhr',
      capacity: 300,
      currentLoad: 180,
      nextDeparture: '2026-05-15T10:00:00'
    },
    {
      id: 'FL-220',
      originId: 'lim',
      destinationId: 'jfk',
      capacity: 240,
      currentLoad: 230,
      nextDeparture: '2026-05-16T07:00:00'
    }
  ];

  getAirportById(id: string) {
    return this.airports.find(a => a.id === id);
  }

  calculateDeliveryTime(origin: any, destination: any) {
    return origin.continent === destination.continent ? 1 : 2;
  }

  handlePlanRoute() {

    if (!this.selectedLuggage) {
      alert('Seleccione un envío');
      return;
    }

    const luggage = this.luggageData.find(
      l => l.id === this.selectedLuggage
    );

    if (!luggage) return;

    const origin = this.getAirportById(luggage.originId);
    const destination = this.getAirportById(luggage.destinationId);

    if (!origin || !destination) return;

    const directFlight = this.flights.find(
      f =>
        f.originId === luggage.originId &&
        f.destinationId === luggage.destinationId
    );

    const deliveryTime = this.calculateDeliveryTime(
      origin,
      destination
    );

    const routePlan = {
      luggageId: luggage.id,
      origin: origin.city,
      destination: destination.city,
      isDirect: !!directFlight,
      deliveryTime,
      route: [origin.code, destination.code],
      estimatedArrival: new Date().toISOString(),
      segments: [
        {
          from: origin.code,
          to: destination.code,
          flight: directFlight?.id || 'N/A',
          capacity: directFlight?.capacity || 0,
          available:
            directFlight
              ? directFlight.capacity - directFlight.currentLoad
              : 0,
          departure:
            directFlight?.nextDeparture || 'Programar'
        }
      ]
    };

    this.routes = [routePlan, ...this.routes];

  }

}