import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AuthRoutingModule } from './auth-routing.module';
import { Login } from './components/login/login.component';
import { CrearUsuario } from './components/crear-usuario/crear-usuario.component';

@NgModule({
  declarations: [Login, CrearUsuario],
  imports: [CommonModule, AuthRoutingModule],
})
export class AuthModule {}
