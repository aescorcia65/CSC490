package com.csc490.androidui

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.csc490.androidui.auth.SupabaseAuthHelper
import com.csc490.androidui.databinding.ActivityMedicationListBinding
import com.csc490.androidui.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MedicationListActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMedicationListBinding
    private val authHelper = SupabaseAuthHelper()

    private val medicationList = mutableListOf<Medication>()
    private lateinit var adapter: MedicationAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMedicationListBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupRecyclerView()
        setupClickListeners()
        loadMedications()
    }

    private fun setupRecyclerView() {
        adapter = MedicationAdapter(medicationList)
        binding.recyclerViewMedications.layoutManager = androidx.recyclerview.widget.LinearLayoutManager(this)
        binding.recyclerViewMedications.adapter = adapter
    }

    private fun setupClickListeners() {
        binding.btnBack.setOnClickListener {
            lifecycleScope.launch {
                try {
                    authHelper.signOut()
                } catch (e: Exception) {
                    // Silently fail or log
                }
                val intent = Intent(this@MedicationListActivity, MainActivity::class.java)
                intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                startActivity(intent)
                finish()
            }
        }

        binding.btnAddMedication.setOnClickListener {
            // Add medication — can be implemented with Supabase insert
        }
    }

    private fun loadMedications() {
        val currentUser = authHelper.currentUser
        if (currentUser == null) {
            binding.tvEmptyState.visibility = View.VISIBLE
            Toast.makeText(this, "Not signed in", Toast.LENGTH_LONG).show()
            return
        }

        lifecycleScope.launch {
            try {
                val list = withContext(Dispatchers.IO) {
                    SupabaseClient.client.from("user_medications")
                        .select()
                        .decodeList<UserMedication>()
                }
                medicationList.clear()
                medicationList.addAll(list.map { it.toMedication() })
                adapter.notifyDataSetChanged()
                binding.tvEmptyState.visibility =
                    if (medicationList.isEmpty()) View.VISIBLE else View.GONE
            } catch (e: Exception) {
                Toast.makeText(this@MedicationListActivity, "Error: ${e.message}", Toast.LENGTH_LONG).show()
                binding.tvEmptyState.visibility = View.VISIBLE
            }
        }
    }
}
