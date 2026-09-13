require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'core-motion'
  s.version        = package['version']
  s.summary        = 'Bridges CMMotionActivityManager (driving/walking classification) and CMMotionManager (raw accelerometer, gated to active drives) for real driving/crash detection.'
  s.description    = s.summary
  s.license        = { :type => 'MIT' }
  s.author         = 'Family Cube'
  s.homepage       = 'https://familycube.app'
  s.platforms      = { :ios => '16.0' }
  s.swift_version  = '5.7'
  s.source         = { :path => '.' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = 'ios/**/*.{h,m,mm,swift,cpp}'
end
