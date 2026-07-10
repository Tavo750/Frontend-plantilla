import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { LoginBody } from '../../interfaces/loginBody';

@Component({
  selector: 'app-login',
  standalone: false,
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class Login implements OnInit {
  loginForm!: FormGroup;
  isLoading = false;
  errorMessage = '';
  showPassword = false;

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    // Credenciales por defecto: el formulario aparece precargado para cualquiera que entre.
    this.loginForm = this.fb.group({
      correo:    ['operador.lima@gmail.com', [Validators.required, Validators.email]],
      contrasena: ['luis123', [Validators.required, Validators.minLength(6)]]
    });
  }

  get correo()    { return this.loginForm.get('correo')!; }
  get contrasena() { return this.loginForm.get('contrasena')!; }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    const body: LoginBody = this.loginForm.value;

    this.authService.login(body).subscribe({
      next: () => {
        this.isLoading = false;
        this.router.navigate(['/inicio']);
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err?.error?.message ?? 'Credenciales incorrectas. Intenta de nuevo.';
      }
    });
  }

  goToRegister(): void {
    this.router.navigate(['/auth/registro']);
  }
}
