import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { GestionAeropuertosComponent } from './components/gestion-aeropuertos.component';
import { GestionAeropuertosRoutingModule } from './gestion-aeropuertos-routing.module';
import { GestionAeropuertosService } from '../../../core/services/gestion-aeropuertos.service';

@NgModule({
  declarations: [GestionAeropuertosComponent],
  imports: [
    CommonModule,
    FormsModule,
    HttpClientModule,
    TableModule,
    DialogModule,
    ButtonModule,
    ToastModule,
    GestionAeropuertosRoutingModule
  ],
  providers: [MessageService, GestionAeropuertosService]
})
export class GestionAeropuertosModule { }
