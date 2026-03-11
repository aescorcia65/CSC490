package com.csc490.androidui

import android.content.Intent
import android.os.Bundle
import android.util.Patterns
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.csc490.androidui.auth.SupabaseAuthHelper
import com.csc490.androidui.databinding.ActivityLoginBinding
import kotlinx.coroutines.launch

/**
 * Login screen — uses activity_login.xml.
 * Uses Supabase Auth for sign-in.
 */
class LoginActivity : AppCompatActivity() {

    private lateinit var binding: ActivityLoginBinding
    private val authHelper = SupabaseAuthHelper()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupClickListeners()
    }

    private fun setupClickListeners() {
        binding.btnBackLogin.setOnClickListener {
            finish()
        }

        binding.loginButton.setOnClickListener {
            val email = binding.emailInput.text.toString().trim()
            val password = binding.passwordInput.text.toString().trim()

            if (validateInputs(email, password)) {
                performLogin(email, password)
            }
        }
    }

    private fun validateInputs(email: String, password: String): Boolean {
        if (email.isEmpty()) {
            binding.emailInput.error = "Email is required"
            binding.emailInput.requestFocus()
            return false
        }
        if (!Patterns.EMAIL_ADDRESS.matcher(email).matches()) {
            binding.emailInput.error = "Enter a valid email"
            binding.emailInput.requestFocus()
            return false
        }
        if (password.isEmpty()) {
            binding.passwordInput.error = "Password is required"
            binding.passwordInput.requestFocus()
            return false
        }
        if (password.length < 6) {
            binding.passwordInput.error = "Password must be at least 6 characters"
            binding.passwordInput.requestFocus()
            return false
        }
        return true
    }

    private fun performLogin(email: String, password: String) {
        binding.loginButton.isEnabled = false
        binding.loginButton.text = "Signing in..."

        lifecycleScope.launch {
            authHelper.signIn(email, password)
                .onSuccess {
                    navigateToMedicationList()
                }
                .onFailure { e ->
                    binding.loginButton.isEnabled = true
                    binding.loginButton.text = "Login"
                    Toast.makeText(
                        this@LoginActivity,
                        "Login failed: ${e.message}",
                        Toast.LENGTH_LONG
                    ).show()
                }
        }
    }

    private fun navigateToMedicationList() {
        startActivity(Intent(this, MedicationListActivity::class.java))
        finishAffinity()
    }
}
