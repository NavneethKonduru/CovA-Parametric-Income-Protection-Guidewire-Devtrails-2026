# CovA Mobile: 100% Pure Kotlin Android Implementation Plan

This is the definitive blueprint for building the **true native** CovA mobile application. We are discarding all React Native/Expo layers and using a **100% native Android stack** built entirely with Android Studio, Kotlin, Jetpack Compose (for UI), Room (for offline database), and Retrofit (for backend networking).

This blueprint provides the exact steps and core Kotlin code to extract true satellite C/N0 hardware data and link it directly to your Node.js backend.

---

## 1. Core Architecture & Android Stack

- **Language:** Kotlin
- **IDE:** Android Studio (Jellyfish or newer)
- **UI Toolkit:** Jetpack Compose
- **Networking:** Retrofit + OkHttp
- **Offline Storage:** Room Database (SQLite)
- **Location/Sensors:** `android.location.LocationManager`, `android.location.GnssStatus`, `android.hardware.SensorManager`
- **Maps:** Google Maps SDK for Android (`com.google.maps.android:maps-compose`)

---

## 2. Step 1: Initialize the Project in Android Studio

Since Android Studio generates heavily optimized Gradle wrappers and build configurations, you must initialize the project via the IDE wizard:

1. Open **Android Studio**.
2. Click **New Project**.
3. Select **Empty Activity** (Jetpack Compose).
4. **Name:** `CovA Native`
5. **Package name:** `com.guidewire.cova`
6. **Language:** Kotlin
7. **Minimum SDK:** API 26 (Android 8.0)

Once the IDE finishes indexing, you will paste the files provided in the `04-app-native-kotlin` directory into your `app/src/main/java/com/guidewire/cova` folder.

---

## 3. Step 2: Gradle Dependencies & Manifest Permissions

**Add to `app/build.gradle.kts` (dependencies block):**
```kotlin
dependencies {
    // Jetpack Compose & Core
    implementation(platform("androidx.compose:compose-bom:2024.04.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    
    // Retrofit (Network) & Gson
    implementation("com.squareup.retrofit2:retrofit:2.9.0")
    implementation("com.squareup.retrofit2:converter-gson:2.9.0")
    
    // Room (Offline DB)
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    annotationProcessor("androidx.room:room-compiler:2.6.1")
    // Use ksp/kapt depending on your setup for Room compiler
    
    // Google Maps Compose
    implementation("com.google.maps.android:maps-compose:4.3.3")
    implementation("com.google.android.gms:play-services-maps:18.2.0")
}
```

**Add to `AndroidManifest.xml`:**
```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <!-- Internet & Network -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    
    <!-- True Hardware Location & GNSS -->
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
    
    <!-- Sensors for Accelerometer (Fraud Detection) -->
    <uses-permission android:name="android.permission.HIGH_SAMPLING_RATE_SENSORS" />
    
    <!-- Foreground Service for Telemetry Polling -->
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />

    <application ...>
        <!-- Maps API Key (Provide this later) -->
        <meta-data
            android:name="com.google.android.geo.API_KEY"
            android:value="YOUR_GOOGLE_MAPS_API_KEY_HERE" />
    </application>
</manifest>
```

---

## 4. Step 3: Hardware GNSS & Sensor Implementation

We will create a Foreground Service (`TelemetryService.kt`) that taps directly into the hardware. It will implement `LocationListener`, `GnssStatus.Callback`, and `SensorEventListener`.

*The complete code for this will be placed in `04-app-native-kotlin/sensors/TelemetryService.kt`.*

**Key Logic:**
1. Requests `LocationManager.GPS_PROVIDER` updates.
2. Extracts `GnssStatus.getCn0DbHz(i)` for each satellite used in the fix to calculate average C/N0 and variance (Synthetic Guard).
3. Extracts `Sensor.TYPE_ACCELEROMETER` to determine if the device is stationary (Indoor Pardon Rule).

---

## 5. Step 4: Offline-First Database (Room)

When the worker is offline, telemetry data is pushed to a local SQLite database using Room.
When the network connects, a Worker thread sweeps the database and performs a bulk POST to `api/telemetry/bulk`.

*The complete code for the Room Entities, DAOs, and Database config will be placed in `04-app-native-kotlin/db/`.*

---

## 6. Step 5: Network Layer (Retrofit)

We will map the existing `02-app-backend` Node.js endpoints directly to Kotlin interfaces.

```kotlin
interface CovAApi {
    @POST("api/workers")
    suspend fun onboardWorker(@Body payload: WorkerPayload): Response<WorkerResponse>

    @POST("api/telemetry")
    suspend fun sendTelemetry(@Body payload: TelemetryPayload): Response<Unit>

    @POST("api/telemetry/bulk")
    suspend fun syncOfflineTelemetry(@Body payload: List<TelemetryPayload>): Response<Unit>
    
    @GET("api/claims")
    suspend fun getClaims(@Query("worker_id") workerId: String): Response<List<Claim>>
}
```

---

## 7. Step 6: Compose UI (Dashboard & Map)

The main UI will be built in `MainActivity.kt` using Jetpack Compose, integrating the Google Maps Compose library to draw the active weather zones (Storm Polygons).

---

## Action Items

I will now generate the foundational Kotlin files in `CovA 126/04-app-native-kotlin`. Once done, you simply need to create the project in Android Studio, copy these files in, plug in the external keys (Google Maps, Server IP, Razorpay, Keystore), and hit "Run".
