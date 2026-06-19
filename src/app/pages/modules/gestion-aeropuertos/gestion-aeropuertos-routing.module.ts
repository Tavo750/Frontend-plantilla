import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { GestionAeropuertosComponent } from './components/gestion-aeropuertos.component';

const routes: Routes = [
  {
    path: '',
    component: GestionAeropuertosComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class GestionAeropuertosRoutingModule { }
