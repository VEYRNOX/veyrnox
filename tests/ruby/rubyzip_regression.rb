# Run from ios/ or android/: bundle exec ruby ../tests/ruby/rubyzip_regression.rb
require "bundler/setup"
require "zip"
require "tmpdir"
require "fileutils"
require "stringio"
require "fastlane"

if Gem.loaded_specs.key?("fastlane-plugin-huawei_appgallery_connect")
  require "fastlane/plugin/huawei_appgallery_connect"
end

raise "Vulnerable rubyzip loaded" if Gem.loaded_specs.fetch("rubyzip").version < Gem::Version.new("3.4.0")

Dir.mktmpdir("rubyzip-regression-") do |root|
  destination = File.join(root, "upload")
  sibling = File.join(root, "upload_backup")
  FileUtils.mkdir_p([destination, sibling])
  archive = File.join(root, "fixture.zip")
  Zip::File.open(archive, create: true) do |zip|
    zip.get_output_stream("safe.txt") { |stream| stream.write("safe content") }
    zip.get_output_stream("../upload_backup/owned.txt") { |stream| stream.write("escaped") }
  end

  warnings = StringIO.new
  previous_stderr = $stderr
  begin
    $stderr = warnings
    Zip::File.open(archive) do |zip|
      zip.each { |entry| entry.extract(destination_directory: destination) }
    end
  ensure
    $stderr = previous_stderr
  end

  raise "Normal extraction failed" unless File.read(File.join(destination, "safe.txt")) == "safe content"
  # GHSA-47m2-wp7j-p9vc: a sibling sharing the destination prefix must not be writable.
  raise "ZIP escaped destination" if File.exist?(File.join(sibling, "owned.txt"))
  raise "Unsafe entry was not reported" unless warnings.string.include?("as unsafe")
end

puts "PASS: fastlane #{Gem.loaded_specs.fetch('fastlane').version}, rubyzip #{Gem.loaded_specs.fetch('rubyzip').version}; normal extraction and sibling traversal rejection"
