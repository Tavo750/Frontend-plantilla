import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { VueloComponent } from './components/vuelo/vuelo.component';

const routes: Routes = [
  { path: '', component: VueloComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class GestionVuelosRoutingModule {}
