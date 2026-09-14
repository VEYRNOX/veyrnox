// VeyrnoxOtaPluginBridge.m — Capacitor registration for VeyrnoxOta.swift
// (OTA web-bundle updates, see docs/ota-updates.md). Listed in
// scripts/register-local-ios-plugins.mjs so Capacitor 8 loads the class.

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(VeyrnoxOtaPlugin, "VeyrnoxOta",
           CAP_PLUGIN_METHOD(status, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(begin, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(prepare, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(stage, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(notifyReady, CAPPluginReturnPromise);
)
