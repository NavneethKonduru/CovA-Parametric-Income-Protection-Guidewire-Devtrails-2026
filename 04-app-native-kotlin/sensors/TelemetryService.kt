package com.guidewire.cova.sensors

import android.annotation.SuppressLint
import android.app.Service
import android.content.Context
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.GnssStatus
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.IBinder
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import com.guidewire.cova.network.CovAApi
import com.guidewire.cova.network.GpsFix
import com.guidewire.cova.network.TelemetryBatch

class TelemetryService : Service(), SensorEventListener {
    private lateinit var locationManager: LocationManager
    private lateinit var sensorManager: SensorManager
    private var accelerometer: Sensor? = null
    
    private var currentCn0: Float = 0.0f
    private var currentVariance: Float = 0.0f
    private var accelX: Float = 0.0f
    private var accelY: Float = 0.0f
    private var accelZ: Float = 0.0f
    private var currentCn0List: List<Float> = emptyList()
    
    private val gpsFixes = mutableListOf<GpsFix>()
    private var lastFlushTime = System.currentTimeMillis()

    private val gnssCallback = object : GnssStatus.Callback() {
        override fun onSatelliteStatusChanged(status: GnssStatus) {
            var totalCn0 = 0.0f
            var count = 0
            val cn0List = mutableListOf<Float>()
            
            for (i in 0 until status.satelliteCount) {
                if (status.usedInFix(i)) {
                    val cn0 = status.getCn0DbHz(i)
                    totalCn0 += cn0
                    cn0List.add(cn0)
                    count++
                }
            }
            if (count > 0) {
                currentCn0 = totalCn0 / count
                val mean = currentCn0
                currentVariance = cn0List.map { (it - mean) * (it - mean) }.average().toFloat()
                currentCn0List = cn0List.toList()
            } else {
                currentCn0 = 0.0f
                currentVariance = 0.0f
                currentCn0List = emptyList()
            }
        }
    }

    private val serviceScope = CoroutineScope(Dispatchers.IO)
    private val covAApi: CovAApi by lazy {
        Retrofit.Builder()
            .baseUrl("http://10.0.2.2:3001/")
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(CovAApi::class.java)
    }

    private val locationListener = LocationListener { location ->
        Log.d("Telemetry", "Lat: ${location.latitude}, Lng: ${location.longitude}, CN0: $currentCn0, Accel: $accelX, IsMocked: ${location.isFromMockProvider}")
        val fix = GpsFix(
            lat = location.latitude,
            lng = location.longitude,
            speed_kph = (location.speed * 3.6).toDouble(),
            heading = location.bearing.toDouble(),
            gnss_variance = currentVariance.toDouble(),
            cn0_values = currentCn0List,
            satellite_count = currentCn0List.size,
            timestamp = java.time.Instant.now().toString(),
            battery_level = 100
        )
        gpsFixes.add(fix)
        
        if (System.currentTimeMillis() - lastFlushTime > 30000 || gpsFixes.size >= 15) {
            val batch = TelemetryBatch(
                worker_id = "WORKER_UNKNOWN",
                device_id = "DEVICE_123",
                session_id = "SESSION_123",
                gps_fixes = gpsFixes.toList(),
                is_offline_batch = false
            )
            gpsFixes.clear()
            lastFlushTime = System.currentTimeMillis()
            
            serviceScope.launch {
                try {
                    covAApi.sendTelemetry(batch)
                } catch (e: Exception) {
                    Log.e("Telemetry", "Error sending telemetry", e)
                }
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    @SuppressLint("MissingPermission")
    override fun onCreate() {
        super.onCreate()
        locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)

        sensorManager.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_NORMAL)
        locationManager.registerGnssStatusCallback(gnssCallback, null)
        locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 2000L, 0f, locationListener)
    }

    override fun onDestroy() {
        super.onDestroy()
        locationManager.removeUpdates(locationListener)
        locationManager.unregisterGnssStatusCallback(gnssCallback)
        sensorManager.unregisterListener(this)
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event?.sensor?.type == Sensor.TYPE_ACCELEROMETER) {
            accelX = event.values[0]
            accelY = event.values[1]
            accelZ = event.values[2]
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
}
