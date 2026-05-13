import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MonitoreoMapaRoutingModule } from './monitoreo-mapa-routing.module';
import { MapaComponent } from './components/mapa/mapa.component';

@NgModule({
  declarations: [
    MapaComponent
  ],
  imports: [
    CommonModule, 
    MonitoreoMapaRoutingModule],
})
export class MonitoreoMapaModule {}
