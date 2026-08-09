require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'widget-data'
  s.version        = package['version']
  s.summary        = 'Writes pet data to the shared App Group so the WidgetKit extension can read it.'
  s.description    = s.summary
  s.license        = { :type => 'MIT' }
  s.author         = 'PawBond'
  s.homepage       = 'https://pawbond.app'
  s.platforms      = { :ios => '16.0' }
  s.swift_version  = '5.7'
  s.source         = { :path => '.' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = 'ios/**/*.{h,m,mm,swift,cpp}'
end
