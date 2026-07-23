import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MessageService } from 'primeng/api';

import { MonitoreoMapaRoutingModule } from './monitoreo-mapa-routing.module';
import { MapaComponent } from './components/mapa/mapa.component';
import { OperacionDiariaComponent } from './components/operacion-diaria/operacion-diaria.component';
import { PrimeNgModule } from '../../../prime-ng/prime-ng.module';

@NgModule({
  declarations: [MapaComponent, OperacionDiariaComponent],
  imports: [
    CommonModule,
    MonitoreoMapaRoutingModule,
    PrimeNgModule
  ],
  providers: [MessageService]
})
export class MonitoreoMapaModule {}
