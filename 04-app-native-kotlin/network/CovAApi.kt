package com.guidewire.cova.network

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

data class WorkerPayload(val name: String, val vehicle: String)
  data class GpsFix(val lat: Double, val lng: Double, val speed_kph: Double,
    val heading: Double, val gnss_variance: Double, val cn0_values: List<Float>,
    val satellite_count: Int, val timestamp: String, val battery_level: Int)
  data class TelemetryBatch(val worker_id: String, val device_id: String,
    val session_id: String, val gps_fixes: List<GpsFix>,
    val is_offline_batch: Boolean = false)

interface CovAApi {
    @POST("api/workers")
    suspend fun onboardWorker(@Body payload: WorkerPayload): Response<Any>

    @POST("api/telemetry/ingest")
    suspend fun sendTelemetry(@Body payload: TelemetryBatch): Response<Unit>

    @POST("api/telemetry/ingest?is_offline_batch=true")
    suspend fun syncOfflineTelemetry(@Body payload: TelemetryBatch): Response<Unit>
    
    @GET("api/claims")
    suspend fun getClaims(@Query("worker_id") workerId: String): Response<List<Any>>
}
