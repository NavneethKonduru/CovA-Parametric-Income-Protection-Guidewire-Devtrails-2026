package com.guidewire.cova.db

import androidx.room.*

@Entity(tableName = "telemetry_buffer")
data class TelemetryEntity(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val workerId: String,
    val lat: Double, val lng: Double, val accuracy: Double,
    val cn0: Double, val gnssVariance: Double,
    val accelX: Double, val accelY: Double, val accelZ: Double,
    val timestamp: String, val isMocked: Boolean
)

@Dao
interface TelemetryDao {
    @Insert
    suspend fun insert(telemetry: TelemetryEntity)

    @Query("SELECT * FROM telemetry_buffer")
    suspend fun getAll(): List<TelemetryEntity>

    @Query("DELETE FROM telemetry_buffer")
    suspend fun clearAll()
}

@Database(entities = [TelemetryEntity::class], version = 1)
abstract class TelemetryDatabase : RoomDatabase() {
    abstract fun telemetryDao(): TelemetryDao
}
