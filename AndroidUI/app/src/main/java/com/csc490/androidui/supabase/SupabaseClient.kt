package com.csc490.androidui.supabase

import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.auth.Auth

object SupabaseClient {
    private const val SUPABASE_URL = "https://ylscfclmlsaqmewqkfrm.supabase.co"
    private const val SUPABASE_ANON_KEY = "sb_publishable_ofEaZ-KYpUWHws9zSt7hIA_7JxVpcqV"

    val client = createSupabaseClient(
        supabaseUrl = SUPABASE_URL,
        supabaseKey = SUPABASE_ANON_KEY
    ) {
        install(Postgrest)
        install(Auth)
    }
}
