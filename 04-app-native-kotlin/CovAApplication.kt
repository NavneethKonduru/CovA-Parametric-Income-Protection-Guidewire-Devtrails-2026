package com.guidewire.cova

import android.app.Application
import androidx.room.Room
import com.guidewire.cova.db.TelemetryDatabase

class CovAApplication : Application() {
    companion object {
        lateinit var database: TelemetryDatabase
            private set
    }

    override fun onCreate() {
        super.onCreate()
        database = Room.databaseBuilder(
            applicationContext,
            TelemetryDatabase::class.java,
            "cova_offline.db"
        ).build()
    }
}
