package com.csc490.androidui

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.csc490.androidui.databinding.ActivityMainBinding

/**
 * Main (and only) activity in this template.
 * Uses View Binding to access layout views.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.welcomeText.text = getString(R.string.welcome_message)
    }
}
