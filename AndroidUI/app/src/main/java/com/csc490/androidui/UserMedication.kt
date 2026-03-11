package com.csc490.androidui

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Matches Supabase table: public.user_medications
 * (id, user_id, medication_name, dosage, freq, reminder_time, color, active, created_at)
 */
@Serializable
data class UserMedication(
    val id: String = "",
    @SerialName("user_id") val userId: String = "",
    @SerialName("medication_name") val medicationName: String = "",
    val dosage: String? = null,
    val freq: String? = "Once daily",
    @SerialName("reminder_time") val reminderTime: String? = "08:00",
    val color: String? = "blue",
    val active: Boolean = true,
    @SerialName("created_at") val createdAt: String? = null
) {
    /** For RecyclerView/Adapter: map to display as Medication (name, dosage, frequency). */
    fun toMedication(): Medication = Medication(
        id = id,
        name = medicationName,
        dosage = dosage ?: "",
        frequency = freq ?: "Once daily",
        userId = userId
    )
}