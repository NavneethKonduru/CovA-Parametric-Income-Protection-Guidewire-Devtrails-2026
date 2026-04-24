package com.guidewire.cova.network

import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

object RetrofitClient {
    // Android Emulator loopback — routes to host machine's localhost
    // Production: replace with your deployed backend URL (e.g. Render)
    private const val BASE_URL = "http://10.0.2.2:5000/"

    val instance: CovAApi by lazy {
        val retrofit = Retrofit.Builder()
            .baseUrl(BASE_URL)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
        retrofit.create(CovAApi::class.java)
    }
}
