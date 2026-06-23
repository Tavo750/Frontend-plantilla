import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';

import { AuthRoutingModule } from './auth-routing.module';
import { Login } from './components/login/login.component';
import { CrearUsuario } from './components/crear-usuario/crear-usuario.component';

@NgModule({
  declarations: [Login, CrearUsuario],
  imports: [CommonModule, ReactiveFormsModule, AuthRoutingModule],
})
export class AuthModule {}
