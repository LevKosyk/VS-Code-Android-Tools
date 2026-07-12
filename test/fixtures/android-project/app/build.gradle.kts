plugins {
    id("com.android.application")
    kotlin("android")
}

android {
    namespace = "dev.androidtools.fixture"
    compileSdk = 35

    defaultConfig {
        applicationId = "dev.androidtools.fixture"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        debug { applicationIdSuffix = ".debug" }
        release { isMinifyEnabled = true }
    }
}
