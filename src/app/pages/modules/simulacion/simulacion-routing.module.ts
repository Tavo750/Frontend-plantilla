import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SimulacionComponent } from './components/simulacion/simulacion.component';

const routes: Routes = [
  { path: '', component: SimulacionComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SimulacionRoutingModule {}
