package com.csc490.androidui

import android.content.Intent
import android.os.Bundle
import android.util.Patterns
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.csc490.androidui.auth.FirebaseAuthHelper
import com.csc490.androidui.databinding.ActivityRegisterBinding
import kotlinx.coroutines.launch

/**
 * Register screen — uses activity_register.xml.
 * Reached via "Get Started" on the landing screen.
 */
class RegisterActivity : AppCompatActivity() {

    private lateinit var binding: ActivityRegisterBinding
    private val authHelper = FirebaseAuthHelper()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityRegisterBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupClickListeners()
    }

    private fun setupClickListeners() {
        binding.btnBackRegister.setOnClickListener {
            finish()
        }

        binding.btnBackRegister.setOnClickListener {
            val name = binding.nameInput.text.toString().trim()
            val email = binding.emailInput.text.toString().trim()
            val password = binding.passwordInput.text.toString().trim()
            val confirmPassword = binding.confirmPasswordInput.text.toString().trim()

            if (validateInputs(name, email, password, confirmPassword)) {
                performRegister(name, email, password)
            }
        }

        binding.tvSignIn.setOnClickListener {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
        }
    }

    private fun validateInputs(
        name: String,
        email: String,
        password: String,
        confirmPassword: String
    ): Boolean {
        binding.nameInput.error = null
        binding.emailInput.error = null
        binding.passwordInput.error = null
        binding.confirmPasswordInput.error = null

        var isValid = true

        if (name.isEmpty()) {
            binding.nameInput.error = "Name is required"
            isValid = false
        }
        if (email.isEmpty()) {
            binding.emailInput.error = "Email is required"
            isValid = false
        } else if (!Patterns.EMAIL_ADDRESS.matcher(email).matches()) {
            binding.emailInput.error = "Enter a valid email"
            isValid = false
        }
        if (password.isEmpty()) {
            binding.passwordInput.error = "Password is required"
            isValid = false
        } else if (password.length < 6) {
            binding.passwordInput.error = "Password must be at least 6 characters"
            isValid = false
        }
        if (confirmPassword.isEmpty()) {
            binding.confirmPasswordInput.error = "Please confirm your password"
            isValid = false
        } else if (password != confirmPassword) {
            binding.confirmPasswordInput.error = "Passwords do not match"
            isValid = false
        }

        return isValid
    }

    private fun performRegister(name: String, email: String, password: String) {
        binding.btnBackRegister.isEnabled = false
        binding.btnBackRegister.text = "Creating account..."

        lifecycleScope.launch {
            authHelper.register(email, password, name)
                .onSuccess { user ->
                    authHelper.sendEmailVerification()
                    Toast.makeText(
                        this@RegisterActivity,
                        "Welcome, ${user.displayName}!",
                        Toast.LENGTH_SHORT
                    ).show()
                    navigateToMedicationList()
                }
                .onFailure { e ->
                    binding.btnBackRegister.isEnabled = true
                    binding.btnBackRegister.text = "Create Account"
                    Toast.makeText(
                        this@RegisterActivity,
                        "Registration failed: ${e.message}",
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