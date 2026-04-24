package com.guidewire.cova.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import kotlinx.coroutines.launch
import com.guidewire.cova.network.RetrofitClient
import com.guidewire.cova.network.WorkerPayload

@Composable
fun OnboardingFlow(navController: NavController) {
    var step by remember { mutableStateOf(1) }
    var name by remember { mutableStateOf("") }
    var vehicle by remember { mutableStateOf("Scooter") }
    val scope = rememberCoroutineScope()

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        if (step == 1) {
            Text("Step 1: Profile Setup", style = MaterialTheme.typography.headlineMedium)
            Spacer(modifier = Modifier.height(16.dp))
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text("Full Name") }
            )
            Spacer(modifier = Modifier.height(16.dp))
            Button(onClick = { step = 2 }) { Text("Next") }
        } else if (step == 2) {
            Text("Step 2: Vehicle Type", style = MaterialTheme.typography.headlineMedium)
            Spacer(modifier = Modifier.height(16.dp))
            Button(onClick = { vehicle = "Scooter"; step = 3 }) { Text("Scooter") }
            Spacer(modifier = Modifier.height(8.dp))
            Button(onClick = { vehicle = "Motorcycle"; step = 3 }) { Text("Motorcycle") }
        } else if (step == 3) {
            Text("Step 3: Coverage Config", style = MaterialTheme.typography.headlineMedium)
            Spacer(modifier = Modifier.height(16.dp))
            Text("Weekly Premium: ₹35")
            Spacer(modifier = Modifier.height(16.dp))
            Button(onClick = { step = 4 }) { Text("Proceed to Payment") }
        } else if (step == 4) {
            Text("Step 4: Payment Simulation", style = MaterialTheme.typography.headlineMedium)
            Spacer(modifier = Modifier.height(16.dp))
            Button(onClick = {
                scope.launch {
                    try {
                        val response = RetrofitClient.instance.onboardWorker(WorkerPayload(name, vehicle))
                        if (response.isSuccessful) {
                            navController.navigate("dashboard") {
                                popUpTo("onboarding") { inclusive = true }
                            }
                        }
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                }
            }) { Text("Simulate Razorpay & Complete") }
        }
    }
}
