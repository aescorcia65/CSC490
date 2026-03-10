package com.csc490.androidui

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.csc490.androidui.auth.FirebaseAuthHelper
import com.csc490.androidui.databinding.ActivityMedicationListBinding

class MedicationListActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMedicationListBinding
    private val authHelper = FirebaseAuthHelper()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMedicationListBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupClickListeners()
    }

    private fun setupClickListeners() {
        binding.btnBack.setOnClickListener {
            authHelper.signOut()
            val intent = Intent(this, MainActivity::class.java)
            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            startActivity(intent)
        }

        binding.btnAddMedication.setOnClickListener {
            Toast.makeText(this, "Add Medication — coming soon!", Toast.LENGTH_SHORT).show()
        }
    }
}